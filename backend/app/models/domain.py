from datetime import datetime, date
from sqlalchemy import (
    Column, Integer, String, Text, Boolean, Date, DateTime, 
    Numeric, Float, Time, ForeignKey, JSON
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(150), nullable=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=True)
    role = Column(String(20), nullable=False) # super_admin, admin, hr, team_lead, employee, intern
    status = Column(String(30), nullable=False, default="Active")
    profile_status = Column(String(30), nullable=False, default="Completed")
    must_change_password = Column(Boolean, nullable=False, default=False)
    onboarding_status = Column(String(30), nullable=False, default="Completed")
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    last_seen_at = Column(DateTime(timezone=True), nullable=True)
    current_status = Column(String(30), nullable=False, default="On Duty")

    profile = relationship("UserProfile", back_populates="user", uselist=False, foreign_keys="UserProfile.user_id")
    assigned_tasks = relationship("TaskAssignment", back_populates="user", cascade="all, delete-orphan")
    created_tasks = relationship("Task", back_populates="assigned_by", foreign_keys="Task.assigned_by_id")
    notifications = relationship("Notification", back_populates="user", cascade="all, delete-orphan")

class UserProfile(Base):
    __tablename__ = "user_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    staff_category = Column(String(8), nullable=True) # Employee, Intern, Manager, Vendor
    staff_id = Column(String(80), nullable=True, unique=True)
    employee_id = Column(String(80), nullable=True, unique=True)
    intern_id = Column(String(80), nullable=True, unique=True)
    mobile = Column(String(40), nullable=True)
    profile_photo = Column(String(500), nullable=True)
    dob = Column(Date, nullable=True)
    gender = Column(String(30), nullable=True)
    address = Column(String(500), nullable=True)
    city = Column(String(100), nullable=True)
    state = Column(String(100), nullable=True)
    country = Column(String(100), nullable=True)
    highest_qualification = Column(String(150), nullable=True)
    institution = Column(String(200), nullable=True)
    degree = Column(String(200), nullable=True)
    graduation_year = Column(Integer, nullable=True)
    resume_url = Column(String(500), nullable=True)
    department = Column(String(120), nullable=True) # Edutech, Ingage, Rezov
    designation = Column(String(120), nullable=True)
    joining_date = Column(Date, nullable=True)
    reporting_manager_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    work_location = Column(String(120), nullable=True)
    internship_end_date = Column(Date, nullable=True)
    internship_status = Column(String(40), nullable=True)
    skills = Column(JSON, nullable=True) # List of skills: ["ReactJS", "FastAPI", ...]
    soft_skills = Column(JSON, nullable=True)
    languages = Column(JSON, nullable=True)
    certifications = Column(JSON, nullable=True)
    work_experience = Column(JSON, nullable=True)
    projects = Column(JSON, nullable=True)
    education_records = Column(JSON, nullable=True)
    professional_links = Column(JSON, nullable=True)

    user = relationship("User", back_populates="profile", foreign_keys=[user_id])
    reporting_manager = relationship("User", foreign_keys=[reporting_manager_id])

class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    client_name = Column(String(200), nullable=True)
    department = Column(String(7), nullable=False) # Ingage, Rezov, Edutech
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    status = Column(String(11), nullable=False, default="In Progress")
    manager_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    tasks = relationship("Task", back_populates="project")
    manager = relationship("User", foreign_keys=[manager_id])

class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(40), nullable=False, default="In Progress") # Backlog, In Progress, Under Review, Completed, Overdue
    priority = Column(String(20), nullable=False, default="Medium") # Low, Medium, High, Critical
    assignment_type = Column(String(20), nullable=False, default="individual")
    assigned_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    start_date = Column(Date, nullable=True)
    due_date = Column(Date, nullable=True)
    estimated_hours = Column(Numeric(6, 2), nullable=True)
    progress = Column(Integer, nullable=False, default=0)
    submission_notes = Column(Text, nullable=True)
    review_comments = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    project = relationship("Project", back_populates="tasks")
    assigned_by = relationship("User", foreign_keys=[assigned_by_id], back_populates="created_tasks")
    assignments = relationship("TaskAssignment", back_populates="task", cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="task")

class TaskAssignment(Base):
    __tablename__ = "task_assignments"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    task = relationship("Task", back_populates="assignments")
    user = relationship("User", back_populates="assigned_tasks")

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True)
    link = Column(String(255), nullable=True)
    notification_type = Column(String(50), nullable=False, default="task_update")
    event_id = Column(String(100), nullable=True)
    is_read = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    read_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="notifications")
    task = relationship("Task", back_populates="notifications")

class InternRecord(Base):
    __tablename__ = "intern_records"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(150), nullable=False)
    email = Column(String(255), nullable=True) # Portal Login Access Email
    mobile_number = Column(String(30), nullable=False)
    emergency_number = Column(String(30), nullable=False)
    residential_address = Column(Text, nullable=False)
    home_address = Column(Text, nullable=False)
    is_home_same_as_residential = Column(Boolean, nullable=False, default=True)
    tenth_marksheet = Column(Text, nullable=False)
    twelfth_marksheet = Column(Text, nullable=False)
    college_marksheet = Column(Text, nullable=False)
    college_name = Column(String(200), nullable=False)
    year_of_start = Column(Integer, nullable=False)
    year_of_end = Column(Integer, nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    created_by = relationship("User", foreign_keys=[created_by_id])

class ServiceExecutionState(Base):
    """Stores the operational state and last execution metadata of background application services."""
    __tablename__ = "service_execution_states"

    id = Column(Integer, primary_key=True, index=True)
    service_name = Column(String(100), unique=True, nullable=False, index=True)
    is_enabled = Column(Boolean, nullable=False, default=True)
    last_executed_at = Column(DateTime(timezone=True), nullable=True)
    last_execution_status = Column(String(50), nullable=True)  # "SUCCESS", "FAILED", "SKIPPED_DISABLED"
    last_execution_type = Column(String(50), nullable=True)    # "SUNDAY_SCHEDULED", "MONDAY_6AM_RETRY", "MANUAL"
    last_deleted_count = Column(Integer, default=0)
    last_scanned_count = Column(Integer, default=0)
    last_error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

class ServiceExecutionLog(Base):
    """Historical execution audit log for application service executions."""
    __tablename__ = "service_execution_logs"

    id = Column(Integer, primary_key=True, index=True)
    service_name = Column(String(100), nullable=False, index=True)
    triggered_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    trigger_type = Column(String(50), nullable=False)          # "SUNDAY_SCHEDULED", "MONDAY_6AM_RETRY", "MANUAL"
    status = Column(String(50), nullable=False)                # "SUCCESS", "FAILED", "SKIPPED_DISABLED"
    scanned_count = Column(Integer, default=0)
    deleted_count = Column(Integer, default=0)
    threshold_date = Column(DateTime(timezone=True), nullable=True)
    details = Column(Text, nullable=True)


# -------------------------------------------------------------
# Real-Time Chat System Models (Person-to-Person & Group Chat)
# -------------------------------------------------------------
class ChatConversation(Base):
    """
    Represents a chat thread:
    - is_group=False: 1-on-1 direct conversation between two users
    - is_group=True: Multi-user group chat with custom title, creator, and dynamic member management
    """
    __tablename__ = "chat_conversations"

    id = Column(Integer, primary_key=True, index=True)
    is_group = Column(Boolean, nullable=False, default=False)
    title = Column(String(150), nullable=True)  # Group name (or None for 1-on-1 direct chat)
    description = Column(String(255), nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    last_message_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
    last_message_preview = Column(String(255), nullable=True)

    created_by = relationship("User", foreign_keys=[created_by_id])
    members = relationship("ChatMember", back_populates="conversation", cascade="all, delete-orphan")
    messages = relationship("ChatMessage", back_populates="conversation", cascade="all, delete-orphan", order_by="ChatMessage.created_at.asc()")


class ChatMember(Base):
    """
    Junction entity representing membership in a chat conversation.
    Supports dynamic membership: joining, admin privileges, and leaving.
    """
    __tablename__ = "chat_members"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("chat_conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(20), nullable=False, default="member")  # "admin", "member"
    is_active = Column(Boolean, nullable=False, default=True)   # Set to False when user leaves group
    joined_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    left_at = Column(DateTime(timezone=True), nullable=True)

    conversation = relationship("ChatConversation", back_populates="members")
    user = relationship("User")


class ChatMessage(Base):
    """
    Individual chat message inside a conversation.
    message_type: 'text' for user chat messages, 'system' for event announcements (e.g. user joined/left).
    """
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("chat_conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    message_text = Column(Text, nullable=False)
    message_type = Column(String(20), nullable=False, default="text")  # "text" | "system"
    is_read = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)

    conversation = relationship("ChatConversation", back_populates="messages")
    sender = relationship("User", foreign_keys=[sender_id])


class AttendanceRecord(Base):
    """
    Attendance punch record per employee per day.
    Tracks check_in, lunch, break, check_out sessions and total working hours.
    """
    __tablename__ = "attendance_records"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    check_in = Column(DateTime(timezone=True), nullable=True)
    lunch_start = Column(DateTime(timezone=True), nullable=True)
    lunch_end = Column(DateTime(timezone=True), nullable=True)
    break_start = Column(DateTime(timezone=True), nullable=True)
    break_end = Column(DateTime(timezone=True), nullable=True)
    check_out = Column(DateTime(timezone=True), nullable=True)
    total_hours = Column(Float, nullable=False, default=0.0)
    status = Column(String(50), nullable=False, default="Present") # Present, On Duty, Half Day, Saturday Working, Weekend
    session_stage = Column(String(50), nullable=False, default="not_started") # not_started, checked_in, lunch, break, checked_out
    notes = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    user = relationship("User")


class AttendanceSetting(Base):
    """
    System settings for Attendance (e.g. Saturday working optional tick toggle).
    """
    __tablename__ = "attendance_settings"

    id = Column(Integer, primary_key=True, index=True)
    setting_key = Column(String(100), unique=True, nullable=False, index=True)
    setting_value = Column(String(255), nullable=False)
    updated_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    updated_by = relationship("User", foreign_keys=[updated_by_id])


class LeavePolicy(Base):
    """
    Super Admin customizable leave limits for each leave mode/category.
    """
    __tablename__ = "leave_policies"

    id = Column(Integer, primary_key=True, index=True)
    leave_key = Column(String(50), unique=True, nullable=False, index=True)
    label = Column(String(100), nullable=False)
    description = Column(String(255), nullable=True)
    max_days_limit = Column(Float, nullable=False, default=5.0)
    updated_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    updated_by = relationship("User", foreign_keys=[updated_by_id])


class LeaveRequest(Base):
    """
    Leave application submitted by non-Super-Admin designations.
    """
    __tablename__ = "leave_requests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    leave_category = Column(String(40), nullable=False, default="regular")  # regular, emergency_leave, sick_leave
    duration_mode = Column(String(40), nullable=False, default="single_day")  # single_day, half_day, consecutive_days, selective_days
    half_day_slot = Column(String(30), nullable=True)  # morning, afternoon
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    selected_dates = Column(JSON, nullable=True)
    total_days = Column(Float, nullable=False, default=1.0)
    reason = Column(Text, nullable=False)
    status = Column(String(30), nullable=False, default="Pending")  # Pending, Approved, Rejected
    reviewed_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewer_remarks = Column(Text, nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    applicant = relationship("User", foreign_keys=[user_id])
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_id])
    recipients = relationship("LeaveRecipient", back_populates="leave_request", cascade="all, delete-orphan")


class LeaveRecipient(Base):
    """
    Tracks the 3 designated recipients (Super Admin, Admin, Higher Officer) for each leave request.
    """
    __tablename__ = "leave_recipients"

    id = Column(Integer, primary_key=True, index=True)
    leave_request_id = Column(Integer, ForeignKey("leave_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    recipient_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    recipient_tier = Column(String(40), nullable=False)  # super_admin, admin, higher_officer
    decision = Column(String(30), nullable=False, default="Pending")
    remarks = Column(Text, nullable=True)
    acted_at = Column(DateTime(timezone=True), nullable=True)

    leave_request = relationship("LeaveRequest", back_populates="recipients")
    recipient = relationship("User", foreign_keys=[recipient_user_id])






