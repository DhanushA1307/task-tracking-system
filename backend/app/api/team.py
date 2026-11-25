from typing import List, Dict, Any
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.domain import User
from app.models.schemas import HierarchyResponse, CreateUserRequest, CreatedUserResponse
from app.cqrs.queries.team_queries import GetHierarchyQuery
from app.cqrs.commands.user_commands import CreateUserCommand
from app.cqrs.handlers.query_handlers import QueryHandlers
from app.cqrs.handlers.command_handlers import CommandHandlers

router = APIRouter(prefix="/team", tags=["Team & Hierarchy"])

@router.post("/users", response_model=CreatedUserResponse, status_code=status.HTTP_201_CREATED)
def create_team_user(
    payload: CreateUserRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    cmd = CreateUserCommand(
        creator_id=current_user.id,
        creator_role=current_user.role,
        full_name=payload.full_name,
        email=payload.email,
        password=payload.password,
        role=payload.role,
        designation_name=payload.designation_name,
        designation_number=payload.designation_number,
        department=payload.department,
        reporting_manager_id=payload.reporting_manager_id,
        mobile=payload.mobile,
        skills=payload.skills
    )
    result = CommandHandlers.handle_create_user(cmd, db)
    return result

@router.get("/hierarchy", response_model=HierarchyResponse)
def get_team_hierarchy(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = GetHierarchyQuery(user_id=current_user.id, role=current_user.role)
    hierarchy = QueryHandlers.handle_get_hierarchy(query, db)
    return hierarchy

@router.get("/assignees")
def get_assignable_members(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns list of successor designation persons and team members who can be allocated to tasks.
    """
    all_users = db.query(User).all()
    user_role_norm = current_user.role.lower().replace(" ", "_")

    super_admins = [u for u in all_users if u.role in ["super_admin", "Super Admin"]]
    admins = [u for u in all_users if u.role in ["admin", "Admin"]]
    hrs = [u for u in all_users if u.role in ["hr", "human_resource_manager"] or (u.profile and "human resource" in (u.profile.designation or "").lower())]
    team_leads = [u for u in all_users if u.role in ["team_lead", "Team Lead"]]
    interns = [u for u in all_users if u.role in ["intern", "Intern"]]

    successors = []
    peers_and_self = []

    if user_role_norm in ["super_admin", "superadmin"]:
        # Rule 1 & Rule 4: Successors are Admins, HRs, Team Leads, Interns
        for a in admins:
            item = QueryHandlers._member_to_item(a, db)
            item["is_successor"] = True
            successors.append(item)
        for h in hrs:
            item = QueryHandlers._member_to_item(h, db)
            item["is_successor"] = True
            successors.append(item)
        for tl in team_leads:
            item = QueryHandlers._member_to_item(tl, db)
            item["is_successor"] = True
            successors.append(item)
        for i in interns:
            item = QueryHandlers._member_to_item(i, db)
            item["is_successor"] = True
            successors.append(item)
        self_item = QueryHandlers._member_to_item(current_user, db)
        self_item["is_successor"] = False
        peers_and_self.append(self_item)

    elif user_role_norm == "admin":
        # Rule 2: Admin -> Team_Lead -> Intern (Scoped strictly to this Admin's own flow)
        # 2nd Admin must NOT see 1st Admin's flow
        my_team_leads = [
            tl for tl in team_leads 
            if tl.profile and tl.profile.reporting_manager_id == current_user.id
        ]
        my_tl_ids = [tl.id for tl in my_team_leads]
        my_interns = [
            i for i in interns 
            if i.profile and (i.profile.reporting_manager_id in my_tl_ids or i.profile.reporting_manager_id == current_user.id)
        ]

        for tl in my_team_leads:
            item = QueryHandlers._member_to_item(tl, db)
            item["is_successor"] = True
            successors.append(item)
        for i in my_interns:
            item = QueryHandlers._member_to_item(i, db)
            item["is_successor"] = True
            successors.append(item)

        self_item = QueryHandlers._member_to_item(current_user, db)
        self_item["is_successor"] = False
        peers_and_self.append(self_item)

        # Allow collaborating with HR as peers
        for h in hrs:
            item = QueryHandlers._member_to_item(h, db)
            item["is_successor"] = False
            peers_and_self.append(item)

    elif user_role_norm in ["hr", "human_resource_manager"] or (current_user.email or "").lower() == "hr@ingage.com":
        # Rule 4: Hierarchy (super_admin -> hr) or (super_admin -> hr -> hr_intern) or (super_admin -> any_roles_relate_with_hr)
        # Successors are ONLY hr_intern or any roles related with HR
        hr_related_successors = [
            u for u in all_users
            if u.id != current_user.id and (
                (u.role or "").lower() in ["hr_intern", "human_resource_intern"] or
                (u.profile and "hr intern" in (u.profile.designation or "").lower()) or
                (u.profile and u.profile.reporting_manager_id == current_user.id)
            )
        ]
        successors = []
        for s in hr_related_successors:
            item = QueryHandlers._member_to_item(s, db)
            item["is_successor"] = True
            successors.append(item)

        self_item = QueryHandlers._member_to_item(current_user, db)
        self_item["is_successor"] = False
        peers_and_self.append(self_item)
        for h in hrs:
            if h.id != current_user.id and h.id not in [s.id for s in hr_related_successors]:
                item = QueryHandlers._member_to_item(h, db)
                item["is_successor"] = False
                peers_and_self.append(item)

    elif user_role_norm == "team_lead":
        # Rule 3: Successors are ONLY Interns reporting directly to this Team Lead
        my_interns = [
            i for i in interns 
            if i.profile and i.profile.reporting_manager_id == current_user.id
        ]
        for i in my_interns:
            item = QueryHandlers._member_to_item(i, db)
            item["is_successor"] = True
            successors.append(item)
        self_item = QueryHandlers._member_to_item(current_user, db)
        self_item["is_successor"] = False
        peers_and_self.append(self_item)

    else: # intern
        # For intern: self + peer interns
        self_item = QueryHandlers._member_to_item(current_user, db)
        self_item["is_successor"] = False
        peers_and_self.append(self_item)
        for i in interns:
            if i.id != current_user.id:
                item = QueryHandlers._member_to_item(i, db)
                item["is_successor"] = False
                peers_and_self.append(item)

    return {
        "successors": successors,
        "peers_and_self": peers_and_self,
        "all_assignable": successors + peers_and_self,
        "user_role": user_role_norm
    }
