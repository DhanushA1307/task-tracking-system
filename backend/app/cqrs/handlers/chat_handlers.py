import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_

from app.models.domain import User, UserProfile, ChatConversation, ChatMember, ChatMessage
from app.models.schemas import (
    ChatUserItem, ChatConversationItem, ChatMemberItem, ChatMessageItem
)
from app.cqrs.commands.chat_commands import (
    CreateDirectConversationCommand,
    CreateGroupConversationCommand,
    SendChatMessageCommand,
    LeaveGroupCommand,
    AddGroupMembersCommand
)
from app.cqrs.queries.chat_queries import (
    GetConversationsQuery,
    GetMessagesQuery,
    GetChatUsersQuery
)
from app.core.websocket_manager import ws_manager

logger = logging.getLogger("chat_handlers")


def _format_user_role(role: Optional[str]) -> str:
    if not role:
        return "User"
    role_lower = role.lower()
    if role_lower == "super_admin":
        return "Super Admin"
    if role_lower == "admin":
        return "Admin"
    if role_lower == "team_lead":
        return "Team Lead"
    if role_lower == "intern":
        return "Intern"
    if role_lower in ["hr", "human_resource_manager"]:
        return "HR Manager"
    return role.replace("_", " ").title()


def _build_chat_user_item(user: User) -> ChatUserItem:
    desig = None
    avatar = None
    if user.profile:
        desig = user.profile.designation
        avatar = user.profile.profile_photo
    if not desig:
        desig = _format_user_role(user.role)

    is_avail = ws_manager.is_user_available(user.id)
    return ChatUserItem(
        id=user.id,
        full_name=user.full_name or user.email,
        email=user.email,
        role=user.role,
        designation=desig,
        avatar=avatar,
        is_available=is_avail
    )


class ChatHandlers:

    @staticmethod
    def handle_get_chat_users(query: GetChatUsersQuery, db: Session) -> List[ChatUserItem]:
        """Returns all company users across all roles and positions for 1-on-1 chat or group selection."""
        users = db.query(User).filter(
            User.id != query.user_id,
            User.status != "Inactive"
        ).order_by(User.full_name.asc(), User.email.asc()).all()

        return [_build_chat_user_item(u) for u in users]

    @staticmethod
    def handle_get_conversations(query: GetConversationsQuery, db: Session) -> List[ChatConversationItem]:
        """
        Returns all active conversations for the user in Reverse Chronological Format:
        Most recently updated / messaged conversation appears at the top.
        """
        memberships = db.query(ChatMember).filter(
            ChatMember.user_id == query.user_id,
            ChatMember.is_active == True
        ).all()

        conv_ids = [m.conversation_id for m in memberships]
        if not conv_ids:
            return []

        conversations_query = db.query(ChatConversation).filter(
            ChatConversation.id.in_(conv_ids)
        )

        if query.filter_type == "direct":
            conversations_query = conversations_query.filter(ChatConversation.is_group == False)
        elif query.filter_type == "group":
            conversations_query = conversations_query.filter(ChatConversation.is_group == True)

        # Reverse Chronological Format: Most recent activity at the top
        conversations = conversations_query.order_by(
            ChatConversation.last_message_at.desc(),
            ChatConversation.updated_at.desc()
        ).all()

        results: List[ChatConversationItem] = []

        for conv in conversations:
            # Query active members
            active_members = db.query(ChatMember).filter(
                ChatMember.conversation_id == conv.id,
                ChatMember.is_active == True
            ).all()

            member_items: List[ChatMemberItem] = []
            other_user_item: Optional[ChatUserItem] = None

            for m in active_members:
                u = m.user
                if not u:
                    continue
                desig = u.profile.designation if u.profile else _format_user_role(u.role)
                avatar = u.profile.profile_photo if u.profile else None

                m_item = ChatMemberItem(
                    user_id=u.id,
                    full_name=u.full_name or u.email,
                    email=u.email,
                    role=u.role,
                    designation=desig,
                    avatar=avatar,
                    member_role=m.role,
                    is_active=m.is_active,
                    joined_at=m.joined_at
                )
                member_items.append(m_item)

                if not conv.is_group and u.id != query.user_id:
                    other_user_item = _build_chat_user_item(u)

            # Determine title
            if conv.is_group:
                conv_title = conv.title or "Untitled Group"
            else:
                conv_title = other_user_item.full_name if other_user_item else "Direct Message"

            # Count unread messages
            unread_count = db.query(ChatMessage).filter(
                ChatMessage.conversation_id == conv.id,
                ChatMessage.sender_id != query.user_id,
                ChatMessage.is_read == False
            ).count()

            item = ChatConversationItem(
                id=conv.id,
                is_group=conv.is_group,
                title=conv_title,
                description=conv.description,
                created_by_id=conv.created_by_id,
                created_at=conv.created_at,
                updated_at=conv.updated_at,
                last_message_at=conv.last_message_at,
                last_message_preview=conv.last_message_preview or "No messages yet",
                member_count=len(active_members),
                other_user=other_user_item,
                members=member_items,
                unread_count=unread_count
            )
            results.append(item)

        return results

    @staticmethod
    def handle_create_direct_conversation(
        cmd: CreateDirectConversationCommand, db: Session
    ) -> ChatConversationItem:
        """Creates or retrieves a 1-on-1 direct conversation between two users."""
        if cmd.user_id == cmd.recipient_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot start a direct message conversation with yourself."
            )

        recipient = db.query(User).filter(User.id == cmd.recipient_id).first()
        if not recipient:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Recipient user not found."
            )

        # Check if direct conversation already exists between both users
        user_conv_ids = [
            m.conversation_id for m in db.query(ChatMember.conversation_id).filter(
                ChatMember.user_id == cmd.user_id
            ).all()
        ]

        existing_conv = None
        if user_conv_ids:
            existing_conv = db.query(ChatConversation).filter(
                ChatConversation.is_group == False,
                ChatConversation.id.in_(user_conv_ids)
            ).join(ChatMember, ChatMember.conversation_id == ChatConversation.id).filter(
                ChatMember.user_id == cmd.recipient_id
            ).first()

        if existing_conv:
            # Reactivate memberships if either was inactive
            db.query(ChatMember).filter(
                ChatMember.conversation_id == existing_conv.id,
                ChatMember.user_id.in_([cmd.user_id, cmd.recipient_id])
            ).update({"is_active": True}, synchronize_session=False)
            db.commit()
            db.refresh(existing_conv)
            conv = existing_conv
        else:
            conv = ChatConversation(
                is_group=False,
                created_by_id=cmd.user_id,
                last_message_preview="Conversation started"
            )
            db.add(conv)
            db.flush()

            m1 = ChatMember(conversation_id=conv.id, user_id=cmd.user_id, role="admin", is_active=True)
            m2 = ChatMember(conversation_id=conv.id, user_id=cmd.recipient_id, role="member", is_active=True)
            db.add_all([m1, m2])
            db.commit()
            db.refresh(conv)

        # Return conversation representation
        other_user = _build_chat_user_item(recipient)
        return ChatConversationItem(
            id=conv.id,
            is_group=False,
            title=other_user.full_name,
            description=None,
            created_by_id=conv.created_by_id,
            created_at=conv.created_at,
            updated_at=conv.updated_at,
            last_message_at=conv.last_message_at,
            last_message_preview=conv.last_message_preview or "Conversation started",
            member_count=2,
            other_user=other_user,
            members=[],
            unread_count=0
        )

    @staticmethod
    def handle_create_group_conversation(
        cmd: CreateGroupConversationCommand, db: Session
    ) -> ChatConversationItem:
        """Creates a group conversation with selected members."""
        title_clean = cmd.title.strip() if cmd.title else ""
        if not title_clean:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Group title is required."
            )

        creator = db.query(User).filter(User.id == cmd.creator_id).first()
        if not creator:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Creator user not found.")

        conv = ChatConversation(
            is_group=True,
            title=title_clean,
            description=cmd.description.strip() if cmd.description else None,
            created_by_id=cmd.creator_id,
            last_message_preview=f"{creator.full_name or 'Admin'} created group '{title_clean}'"
        )
        db.add(conv)
        db.flush()

        # Add creator as group admin
        members = [ChatMember(conversation_id=conv.id, user_id=cmd.creator_id, role="admin", is_active=True)]

        # Add requested members
        valid_member_ids = set(cmd.member_ids)
        valid_member_ids.discard(cmd.creator_id)

        if valid_member_ids:
            found_users = db.query(User).filter(User.id.in_(valid_member_ids)).all()
            for u in found_users:
                members.append(ChatMember(conversation_id=conv.id, user_id=u.id, role="member", is_active=True))

        db.add_all(members)

        # Add initial system message announcing group creation
        sys_msg = ChatMessage(
            conversation_id=conv.id,
            sender_id=cmd.creator_id,
            message_text=f"{creator.full_name or creator.email} created the group '{title_clean}'",
            message_type="system"
        )
        db.add(sys_msg)

        db.commit()
        db.refresh(conv)

        # Format members list
        member_items = []
        for m in members:
            u = db.query(User).filter(User.id == m.user_id).first()
            if u:
                member_items.append(ChatMemberItem(
                    user_id=u.id,
                    full_name=u.full_name or u.email,
                    email=u.email,
                    role=u.role,
                    designation=u.profile.designation if u.profile else _format_user_role(u.role),
                    avatar=u.profile.profile_photo if u.profile else None,
                    member_role=m.role,
                    is_active=True,
                    joined_at=m.joined_at
                ))

        return ChatConversationItem(
            id=conv.id,
            is_group=True,
            title=conv.title,
            description=conv.description,
            created_by_id=conv.created_by_id,
            created_at=conv.created_at,
            updated_at=conv.updated_at,
            last_message_at=conv.last_message_at,
            last_message_preview=conv.last_message_preview,
            member_count=len(members),
            other_user=None,
            members=member_items,
            unread_count=0
        )

    @staticmethod
    def handle_get_messages(query: GetMessagesQuery, db: Session) -> List[ChatMessageItem]:
        """
        Retrieves messages for a conversation.
        Format requirement:
        If user1 (intern) sends a message to user2 (intern), it presents at the top,
        followed down by user2's message below it:
        (user1 message [1st message], user2 message [2nd message]).
        Messages are returned in ascending chronological order (created_at ASC).
        """
        # Verify membership
        membership = db.query(ChatMember).filter(
            ChatMember.conversation_id == query.conversation_id,
            ChatMember.user_id == query.user_id
        ).first()

        if not membership:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not a member of this conversation."
            )

        # Fetch messages in ascending order: oldest on top (1st message), newer below (2nd message)
        messages = db.query(ChatMessage).filter(
            ChatMessage.conversation_id == query.conversation_id
        ).order_by(ChatMessage.created_at.asc()).all()

        results: List[ChatMessageItem] = []
        msg_counter = 0

        for msg in messages:
            sender = msg.sender
            sender_name = "System"
            sender_role = "System"
            sender_desig = "Notification"
            sender_avatar = None

            if sender:
                sender_name = sender.full_name or sender.email
                sender_role = _format_user_role(sender.role)
                sender_desig = sender.profile.designation if sender.profile else sender_role
                sender_avatar = sender.profile.profile_photo if sender.profile else None

            if msg.message_type != "system":
                msg_counter += 1
                seq_idx = msg_counter
            else:
                seq_idx = None

            results.append(ChatMessageItem(
                id=msg.id,
                conversation_id=msg.conversation_id,
                sender_id=msg.sender_id,
                sender_name=sender_name,
                sender_role=sender_role,
                sender_designation=sender_desig,
                sender_avatar=sender_avatar,
                message_text=msg.message_text,
                message_type=msg.message_type,
                created_at=msg.created_at,
                is_self=(msg.sender_id == query.user_id),
                sequence_index=seq_idx
            ))

        # Mark other users' messages as read
        db.query(ChatMessage).filter(
            ChatMessage.conversation_id == query.conversation_id,
            ChatMessage.sender_id != query.user_id,
            ChatMessage.is_read == False
        ).update({"is_read": True}, synchronize_session=False)
        db.commit()

        return results

    @staticmethod
    def handle_send_message(cmd: SendChatMessageCommand, db: Session) -> ChatMessageItem:
        """Sends a message in direct or group conversation and updates conversation timestamp."""
        text = cmd.message_text.strip() if cmd.message_text else ""
        if not text:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Message text cannot be empty."
            )

        membership = db.query(ChatMember).filter(
            ChatMember.conversation_id == cmd.conversation_id,
            ChatMember.user_id == cmd.user_id,
            ChatMember.is_active == True
        ).first()

        if not membership:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not an active member of this conversation."
            )

        conv = db.query(ChatConversation).filter(
            ChatConversation.id == cmd.conversation_id
        ).first()

        if not conv:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversation not found."
            )

        # Create message
        now_dt = datetime.now(timezone.utc)
        msg = ChatMessage(
            conversation_id=cmd.conversation_id,
            sender_id=cmd.user_id,
            message_text=text,
            message_type="text",
            is_read=False,
            created_at=now_dt
        )
        db.add(msg)

        # Update conversation latest message metadata
        sender = db.query(User).filter(User.id == cmd.user_id).first()
        sender_label = sender.full_name or sender.email if sender else "User"

        preview_text = text if len(text) <= 120 else f"{text[:117]}..."
        if conv.is_group:
            conv.last_message_preview = f"{sender_label.split()[0]}: {preview_text}"
        else:
            conv.last_message_preview = preview_text

        conv.last_message_at = now_dt
        conv.updated_at = now_dt

        db.commit()
        db.refresh(msg)

        # Count total user messages to compute sequence index
        total_user_msgs = db.query(ChatMessage).filter(
            ChatMessage.conversation_id == cmd.conversation_id,
            ChatMessage.message_type == "text"
        ).count()

        sender_role_formatted = _format_user_role(sender.role) if sender else "User"
        sender_desig = sender.profile.designation if (sender and sender.profile) else sender_role_formatted
        sender_avatar = sender.profile.profile_photo if (sender and sender.profile) else None

        return ChatMessageItem(
            id=msg.id,
            conversation_id=msg.conversation_id,
            sender_id=msg.sender_id,
            sender_name=sender_label,
            sender_role=sender_role_formatted,
            sender_designation=sender_desig,
            sender_avatar=sender_avatar,
            message_text=msg.message_text,
            message_type=msg.message_type,
            created_at=msg.created_at,
            is_self=True,
            sequence_index=total_user_msgs
        )

    @staticmethod
    def handle_leave_group(cmd: LeaveGroupCommand, db: Session) -> Dict[str, Any]:
        """Allows any member to leave a group conversation dynamically."""
        conv = db.query(ChatConversation).filter(
            ChatConversation.id == cmd.conversation_id
        ).first()

        if not conv:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversation not found."
            )

        if not conv.is_group:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot leave a direct 1-on-1 chat."
            )

        membership = db.query(ChatMember).filter(
            ChatMember.conversation_id == cmd.conversation_id,
            ChatMember.user_id == cmd.user_id,
            ChatMember.is_active == True
        ).first()

        if not membership:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You are not an active member of this group."
            )

        # Deactivate membership
        now_dt = datetime.now(timezone.utc)
        membership.is_active = False
        membership.left_at = now_dt

        # Create system announcement message
        leaving_user = db.query(User).filter(User.id == cmd.user_id).first()
        leaving_name = leaving_user.full_name or leaving_user.email if leaving_user else "A member"

        sys_msg = ChatMessage(
            conversation_id=cmd.conversation_id,
            sender_id=cmd.user_id,
            message_text=f"{leaving_name} left the group",
            message_type="system",
            created_at=now_dt
        )
        db.add(sys_msg)

        conv.last_message_at = now_dt
        conv.last_message_preview = f"{leaving_name} left the group"
        conv.updated_at = now_dt

        db.commit()

        logger.info(f"[Chat] User {cmd.user_id} ({leaving_name}) left group conversation {cmd.conversation_id}")
        return {
            "status": "SUCCESS",
            "message": f"You have left '{conv.title}'.",
            "conversation_id": conv.id
        }

    @staticmethod
    def handle_add_group_members(cmd: AddGroupMembersCommand, db: Session) -> Dict[str, Any]:
        """Adds new members to an existing group conversation."""
        conv = db.query(ChatConversation).filter(
            ChatConversation.id == cmd.conversation_id,
            ChatConversation.is_group == True
        ).first()

        if not conv:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group conversation not found.")

        # Check requestor membership
        requestor_membership = db.query(ChatMember).filter(
            ChatMember.conversation_id == cmd.conversation_id,
            ChatMember.user_id == cmd.user_id,
            ChatMember.is_active == True
        ).first()

        if not requestor_membership:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not an active member of this group.")

        added_names = []
        now_dt = datetime.now(timezone.utc)

        for u_id in set(cmd.new_user_ids):
            user = db.query(User).filter(User.id == u_id).first()
            if not user:
                continue

            existing_m = db.query(ChatMember).filter(
                ChatMember.conversation_id == conv.id,
                ChatMember.user_id == u_id
            ).first()

            if existing_m:
                if not existing_m.is_active:
                    existing_m.is_active = True
                    existing_m.left_at = None
                    existing_m.joined_at = now_dt
                    added_names.append(user.full_name or user.email)
            else:
                new_m = ChatMember(
                    conversation_id=conv.id,
                    user_id=u_id,
                    role="member",
                    is_active=True,
                    joined_at=now_dt
                )
                db.add(new_m)
                added_names.append(user.full_name or user.email)

        if added_names:
            requestor = db.query(User).filter(User.id == cmd.user_id).first()
            req_name = requestor.full_name or requestor.email if requestor else "Admin"
            names_str = ", ".join(added_names)
            sys_msg = ChatMessage(
                conversation_id=conv.id,
                sender_id=cmd.user_id,
                message_text=f"{req_name} added {names_str} to the group",
                message_type="system",
                created_at=now_dt
            )
            db.add(sys_msg)
            conv.last_message_at = now_dt
            conv.last_message_preview = f"Added {names_str}"
            conv.updated_at = now_dt

        db.commit()
        return {
            "status": "SUCCESS",
            "added_count": len(added_names),
            "added_names": added_names
        }
