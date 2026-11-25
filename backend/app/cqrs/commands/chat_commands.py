from dataclasses import dataclass
from typing import List, Optional

@dataclass
class CreateDirectConversationCommand:
    user_id: int
    recipient_id: int

@dataclass
class CreateGroupConversationCommand:
    creator_id: int
    title: str
    description: Optional[str]
    member_ids: List[int]

@dataclass
class SendChatMessageCommand:
    user_id: int
    conversation_id: int
    message_text: str

@dataclass
class LeaveGroupCommand:
    user_id: int
    conversation_id: int

@dataclass
class AddGroupMembersCommand:
    user_id: int
    conversation_id: int
    new_user_ids: List[int]
