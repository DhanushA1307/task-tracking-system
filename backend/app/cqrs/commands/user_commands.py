from dataclasses import dataclass
from typing import Optional, List

@dataclass
class LoginCommand:
    email: str
    password: str

@dataclass
class SSOLoginCommand:
    role_or_email: str

@dataclass
class UpdateUserProfileCommand:
    user_id: int
    full_name: Optional[str] = None
    photo: Optional[str] = None
    employee_designation_number: Optional[str] = None
    employee_designation_name: Optional[str] = None
    skill_set: Optional[List[str]] = None
    full_home_address: Optional[str] = None
    mobile: Optional[str] = None

@dataclass
class CreateUserCommand:
    creator_id: int
    creator_role: str
    full_name: str
    email: str
    password: str
    role: str
    designation_name: Optional[str] = None
    designation_number: Optional[str] = None
    department: Optional[str] = "Edutech"
    reporting_manager_id: Optional[int] = None
    mobile: Optional[str] = None
    skills: Optional[List[str]] = None


@dataclass
class ChangeOwnPasswordCommand:
    user_id: int
    current_password: str
    new_password: str


@dataclass
class ResetUserPasswordCommand:
    actor_id: int
    actor_role: str
    target_user_id: int
    new_password: str
    must_change_password: bool = True



