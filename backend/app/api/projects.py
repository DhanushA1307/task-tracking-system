from typing import List, Optional, Any, Dict
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.domain import User, Project, Task, TaskAssignment
from app.models.schemas import ProjectCreate, ProjectResponse
from app.cqrs.handlers.query_handlers import QueryHandlers
from app.cqrs.queries.task_queries import GetProjectAnalysisQuery

router = APIRouter(prefix="/projects", tags=["Projects"])

@router.get("/analysis", response_model=List[Dict[str, Any]])
def get_project_analysis(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = GetProjectAnalysisQuery(user_id=current_user.id, role=current_user.role)
    return QueryHandlers.handle_get_project_analysis(query, db)

@router.get("", response_model=List[ProjectResponse])
def get_all_projects(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Rule: except Admin and Super Admin, rest of the users should present only their project and follows with successors users
    allowed_ids = QueryHandlers.get_user_and_successor_ids(current_user.id, current_user.role, db)
    if allowed_ids is None:
        projects = db.query(Project).order_by(Project.id.asc()).all()
        return projects

    task_proj_ids = db.query(Task.project_id).filter(
        or_(
            Task.id.in_(
                db.query(TaskAssignment.task_id).filter(TaskAssignment.user_id.in_(allowed_ids))
            ),
            Task.assigned_by_id.in_(allowed_ids)
        )
    ).distinct()

    projects = db.query(Project).filter(
        or_(
            Project.id.in_(task_proj_ids),
            Project.manager_id.in_(allowed_ids)
        )
    ).order_by(Project.id.asc()).all()

    return projects

@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Department constraint check: 'Ingage', 'Rezov', 'Edutech'
    valid_depts = ['Ingage', 'Rezov', 'Edutech']
    dept = payload.department.capitalize() if payload.department else 'Edutech'
    if dept not in valid_depts:
        dept = 'Edutech'

    today = date.today()
    start_d = payload.start_date or today
    end_d = payload.end_date or (start_d + timedelta(days=90))

    if end_d < start_d:
        end_d = start_d + timedelta(days=30)

    new_project = Project(
        name=payload.name.strip(),
        description=payload.description or "",
        client_name=payload.client_name or "Internal",
        department=dept,
        start_date=start_d,
        end_date=end_d,
        status=payload.status or "In Progress",
        manager_id=current_user.id
    )
    db.add(new_project)
    db.commit()
    db.refresh(new_project)
    return new_project

