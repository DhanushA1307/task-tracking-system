from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.domain import User
from app.models.schemas import (
    TaskCreate, TaskUpdate, TaskStatusUpdate, TaskResponse,
    PaginatedTasksResponse, BoardResponse
)
from app.cqrs.commands.task_commands import (
    CreateTaskCommand, UpdateTaskStatusCommand, UpdateTaskDetailsCommand, DeleteTaskCommand
)
from app.cqrs.queries.task_queries import GetTasksQuery, GetBoardTasksQuery, GetTaskByIdQuery
from app.cqrs.handlers.command_handlers import CommandHandlers
from app.cqrs.handlers.query_handlers import QueryHandlers

router = APIRouter(prefix="/tasks", tags=["Tasks"])

@router.get("", response_model=PaginatedTasksResponse)
def get_tasks_tabular(
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    sort_by: str = Query("id"),
    sort_order: str = Query("desc"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = GetTasksQuery(
        user_id=current_user.id,
        role=current_user.role,
        status=status,
        priority=priority,
        search=search,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order
    )
    result = QueryHandlers.handle_get_tasks(query, db)
    return result

@router.get("/board", response_model=BoardResponse)
def get_tasks_board(
    search: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = GetBoardTasksQuery(
        user_id=current_user.id,
        role=current_user.role,
        search=search
    )
    result = QueryHandlers.handle_get_board_tasks(query, db)
    return result

@router.get("/{task_id}", response_model=TaskResponse)
def get_task_details(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = GetTaskByIdQuery(task_id=task_id, user_id=current_user.id, role=current_user.role)
    task = QueryHandlers.handle_get_task_by_id(query, db)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
def create_task(
    payload: TaskCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    cmd = CreateTaskCommand(
        title=payload.title,
        description=payload.description,
        priority=payload.priority,
        status=payload.status,
        due_date=payload.due_date,
        start_date=payload.start_date,
        estimated_hours=payload.estimated_hours,
        progress=payload.progress,
        project_id=payload.project_id,
        assigned_by_id=current_user.id,
        assigned_to_ids=payload.assigned_to_ids or [current_user.id]
    )
    new_task = CommandHandlers.handle_create_task(cmd, db)
    return QueryHandlers._task_to_response(new_task)

@router.patch("/{task_id}/status", response_model=TaskResponse)
def update_task_status(
    task_id: int,
    payload: TaskStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    cmd = UpdateTaskStatusCommand(
        task_id=task_id,
        status=payload.status,
        progress=payload.progress,
        submission_notes=payload.submission_notes,
        user_id=current_user.id
    )
    updated_task = CommandHandlers.handle_update_task_status(cmd, db)
    return QueryHandlers._task_to_response(updated_task)

@router.put("/{task_id}", response_model=TaskResponse)
def update_task_details(
    task_id: int,
    payload: TaskUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    cmd = UpdateTaskDetailsCommand(
        task_id=task_id,
        title=payload.title,
        description=payload.description,
        priority=payload.priority,
        status=payload.status,
        due_date=payload.due_date,
        start_date=payload.start_date,
        estimated_hours=payload.estimated_hours,
        progress=payload.progress,
        submission_notes=payload.submission_notes,
        review_comments=payload.review_comments,
        assigned_to_ids=payload.assigned_to_ids,
        user_id=current_user.id
    )
    task = CommandHandlers.handle_update_task_details(cmd, db)
    return QueryHandlers._task_to_response(task)

@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    cmd = DeleteTaskCommand(task_id=task_id, user_id=current_user.id)
    CommandHandlers.handle_delete_task(cmd, db)
    return None

