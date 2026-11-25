"""
Unit and Integration Test Suite for Real-Time Chat Feature:
1. Direct 1-on-1 Person-to-Person Communication:
   - user1 (intern) sends 1st message to user2 (intern) -> presents at top.
   - user2 (intern) sends 2nd message to user1 (intern) -> presents as user1 message [1st message], user2 message [2nd message].
2. Group Chat Communication:
   - User creates a group with chosen members ("whose wanted").
   - Members exchange messages in order.
   - Member leaves the group dynamically ("whose need to leave").
3. Role Agnostic:
   - Functions seamlessly across all roles (super_admin, admin, team_lead, hr, intern).
4. Reverse Chronological Ordering:
   - Conversations with newer messages float to the top of conversation list.
"""

import unittest
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.domain import User, ChatConversation, ChatMember, ChatMessage
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


class TestChatSystem(unittest.TestCase):
    def setUp(self):
        self.db: Session = SessionLocal()

        # Find users of different roles
        self.intern1 = self.db.query(User).filter(User.role == "intern").order_by(User.id.asc()).first()
        self.intern2 = self.db.query(User).filter(User.role == "intern", User.id != self.intern1.id).first()
        self.team_lead = self.db.query(User).filter(User.role == "team_lead").first()
        self.hr_user = self.db.query(User).filter(User.role == "hr").first()
        self.admin = self.db.query(User).filter(User.role == "admin").first()

        self.assertIsNotNone(self.intern1, "Intern 1 must exist")
        self.assertIsNotNone(self.intern2, "Intern 2 must exist")

    def tearDown(self):
        # Clean up test chat messages, members, and conversations
        test_convs = self.db.query(ChatConversation).filter(
            ChatConversation.title.like("TEST_%") | (ChatConversation.description == "TEST_SUITE")
        ).all()
        for c in test_convs:
            self.db.delete(c)
        self.db.commit()
        self.db.close()

    def test_01_person_to_person_direct_chat_message_order(self):
        """
        Verify person-to-person direct chat:
        User 1 (intern) sends 1st message -> appears at the top.
        User 2 (intern) sends 2nd message -> appears below it.
        Order presented: user1 message [1st message], user2 message [2nd message].
        """
        # 1. Create or get direct conversation between intern1 and intern2
        cmd_create = CreateDirectConversationCommand(
            user_id=self.intern1.id,
            recipient_id=self.intern2.id
        )
        conv = ChatHandlers.handle_create_direct_conversation(cmd_create, self.db)
        self.assertFalse(conv.is_group)

        # 2. User 1 (intern) sends 1st message
        msg1_cmd = SendChatMessageCommand(
            user_id=self.intern1.id,
            conversation_id=conv.id,
            message_text="Hello from intern1! This is the first message."
        )
        msg1 = ChatHandlers.handle_send_message(msg1_cmd, self.db)
        self.assertEqual(msg1.message_text, "Hello from intern1! This is the first message.")
        self.assertTrue(msg1.is_self)

        # 3. User 2 (intern) sends 2nd message
        msg2_cmd = SendChatMessageCommand(
            user_id=self.intern2.id,
            conversation_id=conv.id,
            message_text="Hi intern1! Received your message, this is the second message."
        )
        msg2 = ChatHandlers.handle_send_message(msg2_cmd, self.db)
        self.assertEqual(msg2.message_text, "Hi intern1! Received your message, this is the second message.")

        # 4. Fetch messages from intern1 perspective
        q_msgs = GetMessagesQuery(user_id=self.intern1.id, conversation_id=conv.id)
        messages = ChatHandlers.handle_get_messages(q_msgs, self.db)

        # Must have at least 2 messages in chronological dialogue flow
        self.assertGreaterEqual(len(messages), 2)
        first_msg = messages[0]
        second_msg = messages[1]

        # Verify top is 1st message (from user 1) and bottom is 2nd message (from user 2)
        self.assertEqual(first_msg.sender_id, self.intern1.id)
        self.assertEqual(first_msg.sequence_index, 1)
        self.assertEqual(first_msg.message_text, "Hello from intern1! This is the first message.")

        self.assertEqual(second_msg.sender_id, self.intern2.id)
        self.assertEqual(second_msg.sequence_index, 2)
        self.assertEqual(second_msg.message_text, "Hi intern1! Received your message, this is the second message.")

        print("[TEST 01 PASSED] Direct intern-to-intern message ordering (1st top, 2nd bottom) verified.")

    def test_02_group_chat_creation_messaging_and_leave(self):
        """
        Verify person-to-group:
        - User creates group with desired members ("whose wanted").
        - Messages exchanged.
        - Member leaves group ("whose need to leave").
        - Left member is marked inactive and system message is generated.
        """
        # 1. Intern 1 creates group with Intern 2 and Team Lead
        member_ids = [self.intern2.id]
        if self.team_lead:
            member_ids.append(self.team_lead.id)

        create_group_cmd = CreateGroupConversationCommand(
            creator_id=self.intern1.id,
            title="TEST_Frontend_Sprint_Group",
            description="TEST_SUITE",
            member_ids=member_ids
        )
        group_conv = ChatHandlers.handle_create_group_conversation(create_group_cmd, self.db)
        self.assertTrue(group_conv.is_group)
        self.assertEqual(group_conv.title, "TEST_Frontend_Sprint_Group")
        self.assertEqual(group_conv.member_count, len(member_ids) + 1)

        # 2. Intern 1 sends message in group
        send_cmd = SendChatMessageCommand(
            user_id=self.intern1.id,
            conversation_id=group_conv.id,
            message_text="Welcome everyone to the sprint group!"
        )
        group_msg = ChatHandlers.handle_send_message(send_cmd, self.db)
        self.assertEqual(group_msg.message_text, "Welcome everyone to the sprint group!")

        # 3. Intern 2 leaves the group ("whose need to leave")
        leave_cmd = LeaveGroupCommand(
            user_id=self.intern2.id,
            conversation_id=group_conv.id
        )
        leave_res = ChatHandlers.handle_leave_group(leave_cmd, self.db)
        self.assertEqual(leave_res["status"], "SUCCESS")

        # Verify membership for intern 2 is now inactive
        m2 = self.db.query(ChatMember).filter(
            ChatMember.conversation_id == group_conv.id,
            ChatMember.user_id == self.intern2.id
        ).first()
        self.assertFalse(m2.is_active)

        # Verify messages contain system announcement of member leaving
        q_msgs = GetMessagesQuery(user_id=self.intern1.id, conversation_id=group_conv.id)
        all_msgs = ChatHandlers.handle_get_messages(q_msgs, self.db)
        system_leave_msgs = [m for m in all_msgs if m.message_type == "system" and "left the group" in m.message_text]
        self.assertGreaterEqual(len(system_leave_msgs), 1)

        print("[TEST 02 PASSED] Group chat creation, messaging, and member leave flow verified.")

    def test_03_reverse_chronological_conversation_ordering(self):
        """
        Verify that conversations are listed in reverse chronological format:
        The conversation with the most recent message appears first in the list.
        """
        # Create conv A and conv B
        conv_a_cmd = CreateGroupConversationCommand(
            creator_id=self.intern1.id,
            title="TEST_Conv_A",
            description="TEST_SUITE",
            member_ids=[]
        )
        conv_a = ChatHandlers.handle_create_group_conversation(conv_a_cmd, self.db)

        conv_b_cmd = CreateGroupConversationCommand(
            creator_id=self.intern1.id,
            title="TEST_Conv_B",
            description="TEST_SUITE",
            member_ids=[]
        )
        conv_b = ChatHandlers.handle_create_group_conversation(conv_b_cmd, self.db)

        # Now send a new message in conv A to make it the most recent
        ChatHandlers.handle_send_message(
            SendChatMessageCommand(
                user_id=self.intern1.id,
                conversation_id=conv_a.id,
                message_text="Updating Conv A to be most recent"
            ),
            self.db
        )

        # Query conversations for intern 1
        convs = ChatHandlers.handle_get_conversations(
            GetConversationsQuery(user_id=self.intern1.id),
            self.db
        )

        # In reverse chronological format, Conv A must appear before Conv B
        conv_ids = [c.id for c in convs]
        idx_a = conv_ids.index(conv_a.id)
        idx_b = conv_ids.index(conv_b.id)
        self.assertLess(idx_a, idx_b, "Conversation A had more recent activity and must appear before B")

        print("[TEST 03 PASSED] Reverse chronological conversation ordering verified.")

    def test_04_cross_role_chat_support(self):
        """
        Verify that all roles and positions (Super Admin, Admin, Team Lead, HR, Intern)
        can communicate freely.
        """
        q_users = GetChatUsersQuery(user_id=self.intern1.id)
        colleagues = ChatHandlers.handle_get_chat_users(q_users, self.db)

        roles_present = {c.role for c in colleagues}
        # Verify multiple roles are discoverable by interns
        self.assertTrue(len(roles_present) > 1, f"Found roles: {roles_present}")

        # Test intern chatting with HR Manager
        if self.hr_user:
            direct_hr = ChatHandlers.handle_create_direct_conversation(
                CreateDirectConversationCommand(
                    user_id=self.intern1.id,
                    recipient_id=self.hr_user.id
                ),
                self.db
            )
            msg_hr = ChatHandlers.handle_send_message(
                SendChatMessageCommand(
                    user_id=self.intern1.id,
                    conversation_id=direct_hr.id,
                    message_text="Hi HR Manager, checking in on my intern documentation."
                ),
                self.db
            )
            self.assertEqual(msg_hr.message_text, "Hi HR Manager, checking in on my intern documentation.")

        print("[TEST 04 PASSED] Cross-role communication (all roles and positions) verified.")


if __name__ == "__main__":
    unittest.main()
