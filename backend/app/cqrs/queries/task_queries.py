from dataclasses import dataclass
from typing import Optional

@dataclass
class GetTasksQuery:
    user_id: int
    role: str
    status: Optional[str] = None
    priority: Optional[str] = None
    search: Optional[str] = None
    page: int = 1
    page_size: int = 10
    sort_by: str = "id"
    sort_order: str = "desc"

@dataclass
class GetBoardTasksQuery:
    user_id: int
    role: str
    search: Optional[str] = None

@dataclass
class GetTaskByIdQuery:
    task_id: int
    user_id: int
    role: str

@dataclass
class GetProjectAnalysisQuery:
    user_id: int
    role: str

