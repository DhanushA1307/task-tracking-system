from dataclasses import dataclass
from typing import Optional

@dataclass
class GetConversationsQuery:
    user_id: int
    filter_type: Optional[str] = "all"  # "all", "direct", "group"

@dataclass
class GetMessagesQuery:
    user_id: int
    conversation_id: int
    limit: int = 100

@dataclass
class GetChatUsersQuery:
    user_id: int
