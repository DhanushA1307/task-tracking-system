from dataclasses import dataclass
from typing import Optional, List
from datetime import date

@dataclass
class CreateTaskCommand:
    title: str
    description: Optional[str]
    priority: str
    status: str
    due_date: Optional[date]
    start_date: Optional[date]
    estimated_hours: Optional[float]
    progress: int
    project_id: Optional[int]
    assigned_by_id: int
    assigned_to_ids: List[int]

@dataclass
class UpdateTaskStatusCommand:
    task_id: int
    status: str
    progress: Optional[int]
    submission_notes: Optional[str]
    user_id: int

@dataclass
class UpdateTaskDetailsCommand:
    task_id: int
    title: Optional[str]
    description: Optional[str]
    priority: Optional[str]
    status: Optional[str]
    due_date: Optional[date]
    start_date: Optional[date]
    estimated_hours: Optional[float]
    progress: Optional[int]
    submission_notes: Optional[str]
    review_comments: Optional[str]
    assigned_to_ids: Optional[List[int]]
    user_id: int

@dataclass
class DeleteTaskCommand:
    task_id: int
    user_id: int

