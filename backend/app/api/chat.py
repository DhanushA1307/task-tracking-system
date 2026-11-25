import logging
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.domain import User
from app.models.schemas import (
    ChatUserItem,
    ChatConversationItem,
    ChatMessageItem,
    CreateDirectConversationRequest,
    CreateGroupConversationRequest,
    SendChatMessageRequest,
    AddGroupMembersRequest
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
from app.cqrs.handlers.chat_handlers import ChatHandlers

logger = logging.getLogger("chat_api")

router = APIRouter(prefix="/chat", tags=["Real-Time Chat"])


@router.get("/users", response_model=List[ChatUserItem])
def get_chat_colleagues(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns all active colleagues across all roles and positions (Super Admin, Admin, Team Lead, HR Manager, Intern)
    available for direct 1-on-1 messaging or group chat creation.
    """
    query = GetChatUsersQuery(user_id=current_user.id)
    return ChatHandlers.handle_get_chat_users(query, db)


@router.get("/conversations", response_model=List[ChatConversationItem])
def get_conversations(
    filter_type: Optional[str] = Query("all", regex="^(all|direct|group)$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Retrieves all active conversations for the authenticated user in Reverse Chronological Format:
    The conversation with the most recent message / update appears at the top.
    """
    query = GetConversationsQuery(user_id=current_user.id, filter_type=filter_type)
    return ChatHandlers.handle_get_conversations(query, db)


@router.post("/conversations/direct", response_model=ChatConversationItem)
def create_or_get_direct_conversation(
    payload: CreateDirectConversationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Starts or retrieves a 1-on-1 direct conversation between the authenticated user and another colleague.
    Applicable for any role/position (e.g. Intern to Intern, Intern to Team Lead, Admin to HR).
    """
    cmd = CreateDirectConversationCommand(
        user_id=current_user.id,
        recipient_id=payload.recipient_id
    )
    return ChatHandlers.handle_create_direct_conversation(cmd, db)


@router.post("/conversations/group", response_model=ChatConversationItem, status_code=status.HTTP_201_CREATED)
def create_group_conversation(
    payload: CreateGroupConversationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Creates a new multi-person group chat.
    The creator specifies the group title, description, and selects the desired members.
    """
    cmd = CreateGroupConversationCommand(
        creator_id=current_user.id,
        title=payload.title,
        description=payload.description,
        member_ids=payload.member_ids
    )
    return ChatHandlers.handle_create_group_conversation(cmd, db)


@router.get("/conversations/{conversation_id}/messages", response_model=List[ChatMessageItem])
def get_conversation_messages(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Retrieves all messages in the conversation.
    Ordered chronologically (oldest at top, newest below):
    If user1 sends a message to user2, it is at the top [1st message],
    and user2's response appears below it [2nd message].
    """
    query = GetMessagesQuery(user_id=current_user.id, conversation_id=conversation_id)
    return ChatHandlers.handle_get_messages(query, db)


@router.post("/conversations/{conversation_id}/messages", response_model=ChatMessageItem, status_code=status.HTTP_201_CREATED)
def send_chat_message(
    conversation_id: int,
    payload: SendChatMessageRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Sends a message in the conversation and updates the conversation's reverse-chronological order.
    """
    cmd = SendChatMessageCommand(
        user_id=current_user.id,
        conversation_id=conversation_id,
        message_text=payload.message_text
    )
    return ChatHandlers.handle_send_message(cmd, db)


@router.post("/conversations/{conversation_id}/leave")
def leave_group_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Allows any group member to leave the group chat dynamically ("whose need to leave").
    Marks the user as inactive and generates a system notice.
    """
    cmd = LeaveGroupCommand(
        user_id=current_user.id,
        conversation_id=conversation_id
    )
    return ChatHandlers.handle_leave_group(cmd, db)


@router.post("/conversations/{conversation_id}/members")
def add_group_members(
    conversation_id: int,
    payload: AddGroupMembersRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Adds new members to an existing group chat.
    """
    cmd = AddGroupMembersCommand(
        user_id=current_user.id,
        conversation_id=conversation_id,
        new_user_ids=payload.user_ids
    )
    return ChatHandlers.handle_add_group_members(cmd, db)
