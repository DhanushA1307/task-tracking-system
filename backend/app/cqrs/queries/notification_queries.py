from dataclasses import dataclass

@dataclass
class GetNotificationsQuery:
    user_id: int
    limit: int = 20

