from dataclasses import dataclass
from typing import Optional

@dataclass
class MarkNotificationReadCommand:
    notification_id: int
    user_id: int

@dataclass
class MarkAllNotificationsReadCommand:
    user_id: int

@dataclass
class CreateNotificationCommand:
    user_id: int
    title: str
    message: str
    task_id: Optional[int] = None
    link: Optional[str] = None
    notification_type: str = "task_alert"

@dataclass
class CleanupExpiredNotificationsCommand:
    retention_days: int = 90
    trigger_type: str = "MANUAL"
    force: bool = False

@dataclass
class ToggleNotificationServiceCommand:
    is_enabled: bool


