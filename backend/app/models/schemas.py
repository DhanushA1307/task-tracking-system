from typing import List, Optional, Any, Dict
from pydantic import BaseModel, EmailStr, Field
from datetime import datetime, date

# ----------------- Auth Schemas -----------------
class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class SSOLoginRequest(BaseModel):
    # SSO can authenticate by email or designate default role
    role_or_email: Optional[str] = "intern"

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Dict[str, Any]

class UserMeResponse(BaseModel):
    id: int
    email: str
    full_name: Optional[str] = None
    role: str
    designation: Optional[str] = None
    employee_number: Optional[str] = None
    avatar: Optional[str] = None
    department: Optional[str] = None
    current_status: Optional[str] = "On Duty"
    must_change_password: bool = False
    employee_count: Optional[str] = None
    successor_account_available: Optional[str] = None
    manager_name: Optional[str] = None
    manager_successor_available: Optional[str] = None

# ----------------- Dashboard Schemas -----------------
class WorkCountMetrics(BaseModel):
    completed: int = 0
    in_progress: int = 0
    under_review: int = 0
    backlog: int = 0
    overdue: int = 0
    total: int = 0
    completion_rate: float = 0.0

class DashboardMetricsResponse(BaseModel):
    role: str
    user_name: str
    work_counts: WorkCountMetrics
    weekly_hours: float = 0.0
    current_status: str = "On Duty"
    department: Optional[str] = "Edutech"
    recent_tasks: List[Dict[str, Any]] = []
    performance_summary: Optional[Dict[str, Any]] = None
    team_members: Optional[List[Dict[str, Any]]] = None
    employee_count: Optional[str] = None
    successor_account_available: Optional[str] = None
    hierarchy_flow: Optional[str] = None
    predecessor_name: Optional[str] = None

# ----------------- Project Schemas -----------------
class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    department: str = "Edutech" # Ingage, Rezov, Edutech
    client_name: Optional[str] = "Internal"
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: Optional[str] = "In Progress"

class ProjectResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    client_name: Optional[str] = None
    department: str
    start_date: date
    end_date: date
    status: str
    manager_id: Optional[int] = None

    class Config:
        from_attributes = True

# ----------------- Task Schemas -----------------
class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    priority: str = "Medium" # Low, Medium, High, Critical
    status: str = "In Progress" # Backlog, In Progress, Under Review, Completed, Overdue
    due_date: Optional[date] = None
    start_date: Optional[date] = None
    estimated_hours: Optional[float] = 0.0
    progress: int = 0
    project_id: Optional[int] = None

class TaskCreate(TaskBase):
    assigned_to_ids: List[int] = []

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    due_date: Optional[date] = None
    start_date: Optional[date] = None
    estimated_hours: Optional[float] = None
    progress: Optional[int] = None
    submission_notes: Optional[str] = None
    review_comments: Optional[str] = None
    assigned_to_ids: Optional[List[int]] = None

class TaskStatusUpdate(BaseModel):
    status: str
    progress: Optional[int] = None
    submission_notes: Optional[str] = None

class TaskAssigneeResponse(BaseModel):
    id: int
    full_name: Optional[str]
    email: str
    role: str
    avatar: Optional[str] = None
    designation: Optional[str] = None

class TaskResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    status: str
    priority: str
    progress: int
    due_date: Optional[date] = None
    start_date: Optional[date] = None
    estimated_hours: Optional[float] = None
    project_id: Optional[int] = None
    project_name: Optional[str] = None
    assigned_by_id: Optional[int] = None
    assigned_by_name: Optional[str] = None
    assigned_by_role: Optional[str] = None
    assigned_by_avatar: Optional[str] = None
    assigned_by_designation: Optional[str] = None
    assignees: List[TaskAssigneeResponse] = []
    submission_notes: Optional[str] = None
    review_comments: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class PaginatedTasksResponse(BaseModel):
    items: List[TaskResponse]
    total: int
    page: int
    page_size: int
    total_pages: int

class BoardColumn(BaseModel):
    id: str
    name: str
    count: int
    tasks: List[TaskResponse]

class BoardResponse(BaseModel):
    columns: List[BoardColumn]

# ----------------- Team & Hierarchy Schemas -----------------
class CreateUserRequest(BaseModel):
    full_name: str
    email: EmailStr
    password: str = Field(..., min_length=6)
    role: str # successor role (admin, team_lead, intern)
    designation_name: Optional[str] = None
    designation_number: Optional[str] = None
    department: Optional[str] = "Edutech"
    reporting_manager_id: Optional[int] = None
    mobile: Optional[str] = None
    skills: Optional[List[str]] = []

class CreatedUserResponse(BaseModel):
    id: int
    full_name: str
    email: str
    role: str
    designation_name: str
    designation_number: str
    department: str
    current_status: str = "On Duty"
    message: Optional[str] = None

class TeamMemberItem(BaseModel):
    id: int
    full_name: str
    email: str
    role: str # super_admin, admin, team_lead, intern
    designation_name: str
    designation_number: str
    department: str
    photo: Optional[str] = None
    mobile: Optional[str] = None
    current_status: str = "On Duty"
    reporting_manager_id: Optional[int] = None
    active_tasks_count: int = 0
    skills: List[str] = []
    is_available: Optional[bool] = False
    availability_status: Optional[str] = "NA"

class HierarchyResponse(BaseModel):
    user_role: str
    # Predecessors (Superiors / Higher Designation position person)
    predecessors: List[TeamMemberItem] = []
    # Successors (Subordinates / Lower Designation reporting members)
    successors: List[TeamMemberItem] = []
    # Peers (same level)
    peers: List[TeamMemberItem] = []
    # Full org tree or hierarchy path for this user
    hierarchy_chain: List[TeamMemberItem] = []

# ----------------- Settings / Profile Schemas -----------------
class UserProfileDetails(BaseModel):
    # Explicit fields requested:
    # "Photo", "Full Name", "mail-Id Address", "Employee Designation Number", "Employee Designation Name", "Skill set", "Full Home Address"
    photo: Optional[str] = None
    full_name: str
    email: str
    employee_designation_number: str
    employee_designation_name: str
    skill_set: List[str] = []
    full_home_address: str
    
    # Additional context fields:
    mobile: Optional[str] = None
    department: Optional[str] = None
    role: str
    current_status: Optional[str] = "On Duty"
    date_of_joining: Optional[date] = None
    reporting_manager_name: Optional[str] = None
    reporting_manager_role: Optional[str] = None
    employee_count: Optional[str] = None
    successor_account_available: Optional[str] = None
    manager_name: Optional[str] = None
    manager_successor_available: Optional[str] = None

class UserProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    photo: Optional[str] = None
    employee_designation_number: Optional[str] = None
    employee_designation_name: Optional[str] = None
    skill_set: Optional[List[str]] = None
    full_home_address: Optional[str] = None
    mobile: Optional[str] = None

# ----------------- Notification Schemas -----------------
class NotificationItem(BaseModel):
    id: int
    title: str
    message: str
    task_id: Optional[int] = None
    link: Optional[str] = None
    notification_type: str
    is_read: bool
    created_at: datetime

class NotificationListResponse(BaseModel):
    items: List[NotificationItem]
    unread_count: int

# ----------------- Intern Record Schemas (HR Module) -----------------
class InternRecordBase(BaseModel):
    full_name: str
    email: Optional[str] = None
    mobile_number: str
    emergency_number: str
    residential_address: str
    home_address: str
    is_home_same_as_residential: bool = True
    tenth_marksheet: str
    twelfth_marksheet: str
    college_marksheet: str
    college_name: str
    year_of_start: int
    year_of_end: int

class InternRecordCreate(InternRecordBase):
    pass

class InternRecordUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    mobile_number: Optional[str] = None
    emergency_number: Optional[str] = None
    residential_address: Optional[str] = None
    home_address: Optional[str] = None
    is_home_same_as_residential: Optional[bool] = None
    tenth_marksheet: Optional[str] = None
    twelfth_marksheet: Optional[str] = None
    college_marksheet: Optional[str] = None
    college_name: Optional[str] = None
    year_of_start: Optional[int] = None
    year_of_end: Optional[int] = None

class InternRecordResponse(InternRecordBase):
    id: int
    created_by_id: Optional[int] = None
    created_by_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class InternRecordListResponse(BaseModel):
    items: List[InternRecordResponse]
    total: int


# ----------------- Chat Schemas -----------------
class ChatUserItem(BaseModel):
    id: int
    full_name: str
    email: str
    role: str
    designation: Optional[str] = None
    avatar: Optional[str] = None
    is_available: bool = False

class CreateDirectConversationRequest(BaseModel):
    recipient_id: int

class CreateGroupConversationRequest(BaseModel):
    title: str
    description: Optional[str] = None
    member_ids: List[int] = []

class SendChatMessageRequest(BaseModel):
    message_text: str

class AddGroupMembersRequest(BaseModel):
    user_ids: List[int]

class ChatMemberItem(BaseModel):
    user_id: int
    full_name: str
    email: str
    role: str
    designation: Optional[str] = None
    avatar: Optional[str] = None
    member_role: str = "member"
    is_active: bool = True
    joined_at: Optional[datetime] = None

class ChatMessageItem(BaseModel):
    id: int
    conversation_id: int
    sender_id: Optional[int] = None
    sender_name: Optional[str] = None
    sender_role: Optional[str] = None
    sender_designation: Optional[str] = None
    sender_avatar: Optional[str] = None
    message_text: str
    message_type: str = "text"  # "text" | "system"
    created_at: datetime
    is_self: bool = False
    sequence_index: Optional[int] = None  # 1 for 1st message, 2 for 2nd message, etc.

class ChatConversationItem(BaseModel):
    id: int
    is_group: bool
    title: str
    description: Optional[str] = None
    created_by_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    last_message_at: datetime
    last_message_preview: Optional[str] = None
    member_count: int = 0
    other_user: Optional[ChatUserItem] = None
    members: List[ChatMemberItem] = []
    unread_count: int = 0


# ----------------- Password Management Schemas -----------------
class ChangeOwnPasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=6, max_length=128)


class ResetUserPasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=6, max_length=128)
    must_change_password: bool = True


class PasswordUpdateResponse(BaseModel):
    success: bool
    message: str
    user_id: int
    must_change_password: bool = False




