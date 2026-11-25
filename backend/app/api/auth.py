from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_user, oauth2_scheme
from app.core.notification_broadcaster import broadcaster
from app.core.websocket_manager import ws_manager
from app.models.domain import User
from app.models.schemas import (
    LoginRequest, SSOLoginRequest, TokenResponse, UserMeResponse,
    ChangeOwnPasswordRequest, PasswordUpdateResponse,
)
from app.cqrs.commands.user_commands import LoginCommand, SSOLoginCommand, ChangeOwnPasswordCommand
from app.cqrs.handlers.command_handlers import CommandHandlers
from app.cqrs.handlers.query_handlers import QueryHandlers
from app.cqrs.queries.user_queries import GetUserProfileQuery

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    cmd = LoginCommand(email=request.email, password=request.password)
    result = CommandHandlers.handle_login(cmd, db)
    if result and "user" in result and "id" in result["user"]:
        broadcaster.mark_user_login(result["user"]["id"])
    return result

@router.post("/sso-login", response_model=TokenResponse)
def sso_login(request: SSOLoginRequest, db: Session = Depends(get_db)):
    cmd = SSOLoginCommand(role_or_email=request.role_or_email or "intern")
    result = CommandHandlers.handle_sso_login(cmd, db)
    if result and "user" in result and "id" in result["user"]:
        broadcaster.mark_user_login(result["user"]["id"])
    return result

@router.post("/logout")
async def logout(
    current_user: User = Depends(get_current_user),
    token: str = Depends(oauth2_scheme),
):
    broadcaster.mark_user_logout(current_user.id)
    await ws_manager.disconnect_session(current_user.id, token)
    return {"message": "Logged out successfully"}

@router.get("/me", response_model=UserMeResponse)
def get_current_user_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    broadcaster.mark_user_login(current_user.id)
    query = GetUserProfileQuery(user_id=current_user.id)
    profile_data = QueryHandlers.handle_get_user_profile(query, db)
    if not profile_data:
        raise HTTPException(status_code=404, detail="Profile not found")
        
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": profile_data["full_name"],
        "role": current_user.role,
        "designation": profile_data["employee_designation_name"],
        "employee_number": profile_data["employee_designation_number"],
        "avatar": profile_data["photo"],
        "department": profile_data["department"],
        "current_status": current_user.current_status or "On Duty",
        "must_change_password": bool(current_user.must_change_password),
        "employee_count": profile_data.get("employee_count"),
        "successor_account_available": profile_data.get("successor_account_available"),
        "manager_name": profile_data.get("reporting_manager_name"),
        "manager_successor_available": profile_data.get("manager_successor_available"),
    }


@router.post("/change-password", response_model=PasswordUpdateResponse)
def change_own_password(
    payload: ChangeOwnPasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Allow an authenticated user to change their own password after verifying current password."""
    cmd = ChangeOwnPasswordCommand(
        user_id=current_user.id,
        current_password=payload.current_password,
        new_password=payload.new_password,
    )
    return CommandHandlers.handle_change_own_password(cmd, db)

