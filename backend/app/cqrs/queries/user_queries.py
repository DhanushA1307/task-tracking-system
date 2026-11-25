from dataclasses import dataclass

@dataclass
class GetUserProfileQuery:
    user_id: int

@dataclass
class ListUsersByRoleQuery:
    role: str

