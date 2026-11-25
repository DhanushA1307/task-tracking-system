from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.domain import User
from app.models.schemas import UserProfileDetails, UserProfileUpdateRequest
from app.cqrs.queries.user_queries import GetUserProfileQuery
from app.cqrs.commands.user_commands import UpdateUserProfileCommand
from app.cqrs.handlers.query_handlers import QueryHandlers
from app.cqrs.handlers.command_handlers import CommandHandlers

router = APIRouter(prefix="/settings", tags=["Settings & Profile"])

@router.get("/profile", response_model=UserProfileDetails)
def get_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = GetUserProfileQuery(user_id=current_user.id)
    profile_data = QueryHandlers.handle_get_user_profile(query, db)
    if not profile_data:
        raise HTTPException(status_code=404, detail="User profile not found")
    return profile_data

@router.put("/profile")
def update_profile(
    payload: UserProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    cmd = UpdateUserProfileCommand(
        user_id=current_user.id,
        full_name=payload.full_name,
        photo=payload.photo,
        employee_designation_number=payload.employee_designation_number,
        employee_designation_name=payload.employee_designation_name,
        skill_set=payload.skill_set,
        full_home_address=payload.full_home_address,
        mobile=payload.mobile,
    )
    result = CommandHandlers.handle_update_user_profile(cmd, db)
    return result

