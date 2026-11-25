from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc

from app.core.database import get_db
from app.core.security import get_current_user, get_password_hash
from app.models.domain import User, UserProfile, InternRecord
from app.models.schemas import (
    InternRecordCreate,
    InternRecordUpdate,
    InternRecordResponse,
    InternRecordListResponse,
)

router = APIRouter(prefix="/intern-records", tags=["Intern Records (HR)"])

def verify_hr_or_admin_permission(current_user: User):
    role = (current_user.role or "").lower()
    designation = (current_user.profile.designation if current_user.profile else "").lower()
    allowed_roles = ["super_admin", "superadmin", "admin", "hr", "human_resource_manager"]
    if role not in allowed_roles and "human resource" not in designation:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access restricted to Super Admin, Admin, and Human Resource Manager",
        )

@router.get("", response_model=InternRecordListResponse)
def list_intern_records(
    search: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Only Super Admin, Admin, and Human Resource Manager can access HR intern records
    verify_hr_or_admin_permission(current_user)
    query = db.query(InternRecord)

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                InternRecord.full_name.ilike(term),
                InternRecord.email.ilike(term),
                InternRecord.mobile_number.ilike(term),
                InternRecord.emergency_number.ilike(term),
                InternRecord.college_name.ilike(term),
                InternRecord.residential_address.ilike(term),
                InternRecord.home_address.ilike(term),
            )
        )

    records = query.order_by(desc(InternRecord.id)).all()

    items = []
    for r in records:
        created_by_name = r.created_by.full_name if r.created_by else "HR Department"
        items.append(
            InternRecordResponse(
                id=r.id,
                full_name=r.full_name,
                email=r.email,
                mobile_number=r.mobile_number,
                emergency_number=r.emergency_number,
                residential_address=r.residential_address,
                home_address=r.home_address,
                is_home_same_as_residential=r.is_home_same_as_residential,
                tenth_marksheet=r.tenth_marksheet,
                twelfth_marksheet=r.twelfth_marksheet,
                college_marksheet=r.college_marksheet,
                college_name=r.college_name,
                year_of_start=r.year_of_start,
                year_of_end=r.year_of_end,
                created_by_id=r.created_by_id,
                created_by_name=created_by_name,
                created_at=r.created_at,
                updated_at=r.updated_at,
            )
        )

    return InternRecordListResponse(items=items, total=len(items))

@router.post("", response_model=InternRecordResponse)
def create_intern_record(
    payload: InternRecordCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    verify_hr_or_admin_permission(current_user)

    # Note validation: Mobile Number and Emergency Number should not same
    mobile_clean = payload.mobile_number.strip().replace(" ", "").replace("-", "")
    emergency_clean = payload.emergency_number.strip().replace(" ", "").replace("-", "")

    if mobile_clean == emergency_clean:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mobile Number and Emergency Number should not be the same. Please provide a distinct emergency contact number.",
        )

    # Resolve Home Address if Same as Residential Address is checked
    final_home_address = payload.residential_address if payload.is_home_same_as_residential else payload.home_address

    intern_email = (payload.email or "").strip().lower()
    if not intern_email:
        # Default generated email format
        name_part = payload.full_name.strip().lower().replace(" ", ".")
        intern_email = f"{name_part}@ingage.com"

    # Automatically provision portal login user for this intern with default password "admin123"
    portal_user = db.query(User).filter(User.email == intern_email).first()
    if not portal_user:
        portal_user = User(
            email=intern_email,
            full_name=payload.full_name.strip(),
            password_hash=get_password_hash("admin123"),
            role="intern",
            status="Active",
            profile_status="Completed",
            current_status="On Duty",
        )
        db.add(portal_user)
        db.flush()

        tl = db.query(User).filter(User.role == "team_lead").first()
        prof = UserProfile(
            user_id=portal_user.id,
            staff_category="Intern",
            intern_id=f"ING-INT-2026-{portal_user.id:04d}",
            designation="Developer Intern",
            department="Edutech",
            reporting_manager_id=tl.id if tl else None,
            mobile=payload.mobile_number.strip(),
            address=payload.residential_address.strip(),
            city="Chennai",
            state="Tamil Nadu",
            country="India",
        )
        db.add(prof)
    else:
        # Ensure intern password is admin123
        portal_user.password_hash = get_password_hash("admin123")
        portal_user.role = "intern"
        portal_user.status = "Active"

    new_record = InternRecord(
        full_name=payload.full_name.strip(),
        email=intern_email,
        mobile_number=payload.mobile_number.strip(),
        emergency_number=payload.emergency_number.strip(),
        residential_address=payload.residential_address.strip(),
        home_address=final_home_address.strip(),
        is_home_same_as_residential=payload.is_home_same_as_residential,
        tenth_marksheet=payload.tenth_marksheet.strip(),
        twelfth_marksheet=payload.twelfth_marksheet.strip(),
        college_marksheet=payload.college_marksheet.strip(),
        college_name=payload.college_name.strip(),
        year_of_start=payload.year_of_start,
        year_of_end=payload.year_of_end,
        created_by_id=current_user.id,
    )

    db.add(new_record)
    db.commit()
    db.refresh(new_record)

    default_creator_title = "Super Admin" if current_user.role in ["super_admin", "superadmin"] else ("Admin" if current_user.role == "admin" else "HR Manager")
    created_by_name = current_user.full_name or default_creator_title
    return InternRecordResponse(
        id=new_record.id,
        full_name=new_record.full_name,
        email=new_record.email,
        mobile_number=new_record.mobile_number,
        emergency_number=new_record.emergency_number,
        residential_address=new_record.residential_address,
        home_address=new_record.home_address,
        is_home_same_as_residential=new_record.is_home_same_as_residential,
        tenth_marksheet=new_record.tenth_marksheet,
        twelfth_marksheet=new_record.twelfth_marksheet,
        college_marksheet=new_record.college_marksheet,
        college_name=new_record.college_name,
        year_of_start=new_record.year_of_start,
        year_of_end=new_record.year_of_end,
        created_by_id=new_record.created_by_id,
        created_by_name=created_by_name,
        created_at=new_record.created_at,
        updated_at=new_record.updated_at,
    )

@router.get("/{id}", response_model=InternRecordResponse)
def get_intern_record(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    verify_hr_or_admin_permission(current_user)
    record = db.query(InternRecord).filter(InternRecord.id == id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Intern record not found")

    created_by_name = record.created_by.full_name if record.created_by else "HR Department"
    return InternRecordResponse(
        id=record.id,
        full_name=record.full_name,
        email=record.email,
        mobile_number=record.mobile_number,
        emergency_number=record.emergency_number,
        residential_address=record.residential_address,
        home_address=record.home_address,
        is_home_same_as_residential=record.is_home_same_as_residential,
        tenth_marksheet=record.tenth_marksheet,
        twelfth_marksheet=record.twelfth_marksheet,
        college_marksheet=record.college_marksheet,
        college_name=record.college_name,
        year_of_start=record.year_of_start,
        year_of_end=record.year_of_end,
        created_by_id=record.created_by_id,
        created_by_name=created_by_name,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )

@router.put("/{id}", response_model=InternRecordResponse)
def update_intern_record(
    id: int,
    payload: InternRecordUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    verify_hr_or_admin_permission(current_user)
    record = db.query(InternRecord).filter(InternRecord.id == id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Intern record not found")

    mobile = payload.mobile_number if payload.mobile_number is not None else record.mobile_number
    emergency = payload.emergency_number if payload.emergency_number is not None else record.emergency_number

    if mobile and emergency:
        m_clean = mobile.strip().replace(" ", "").replace("-", "")
        e_clean = emergency.strip().replace(" ", "").replace("-", "")
        if m_clean == e_clean:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Mobile Number and Emergency Number should not be the same. Please provide a distinct emergency contact number.",
            )

    update_data = payload.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(record, field, value)

    if record.is_home_same_as_residential:
        record.home_address = record.residential_address

    db.commit()
    db.refresh(record)

    created_by_name = record.created_by.full_name if record.created_by else "HR Department"
    return InternRecordResponse(
        id=record.id,
        full_name=record.full_name,
        email=record.email,
        mobile_number=record.mobile_number,
        emergency_number=record.emergency_number,
        residential_address=record.residential_address,
        home_address=record.home_address,
        is_home_same_as_residential=record.is_home_same_as_residential,
        tenth_marksheet=record.tenth_marksheet,
        twelfth_marksheet=record.twelfth_marksheet,
        college_marksheet=record.college_marksheet,
        college_name=record.college_name,
        year_of_start=record.year_of_start,
        year_of_end=record.year_of_end,
        created_by_id=record.created_by_id,
        created_by_name=created_by_name,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )

@router.delete("/{id}")
def delete_intern_record(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    verify_hr_or_admin_permission(current_user)
    record = db.query(InternRecord).filter(InternRecord.id == id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Intern record not found")

    db.delete(record)
    db.commit()
    return {"message": f"Intern record #{id} deleted successfully"}

@router.post("/generate-sample", response_model=InternRecordListResponse)
def generate_sample_intern_records(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    verify_hr_or_admin_permission(current_user)

    sample_items = [
        {
            "full_name": "Priya Sharma",
            "email": "priya.sharma@ingage.com",
            "mobile_number": "+91 98112 34567",
            "emergency_number": "+91 94440 88991",
            "residential_address": "Flat 104, Green Park Residences, Anna Nagar, Chennai - 600040",
            "home_address": "Flat 104, Green Park Residences, Anna Nagar, Chennai - 600040",
            "is_home_same_as_residential": True,
            "tenth_marksheet": "10th_Marksheet_Priya_Sharma_93pct.pdf",
            "twelfth_marksheet": "12th_Marksheet_Priya_Sharma_HSC_91pct.pdf",
            "college_marksheet": "College_Consolidated_Marksheet_Priya_8.8CGPA.pdf",
            "college_name": "College of Engineering, Guindy (Anna University)",
            "year_of_start": 2021,
            "year_of_end": 2025,
        },
        {
            "full_name": "Dhanush A",
            "email": "drickcurve123@gmail.com",
            "mobile_number": "+91 98765 43210",
            "emergency_number": "+91 98409 11223",
            "residential_address": "No. 42, Silicon Valley Avenue, T. Nagar, Chennai - 600017",
            "home_address": "No. 42, Silicon Valley Avenue, T. Nagar, Chennai - 600017",
            "is_home_same_as_residential": True,
            "tenth_marksheet": "10th_Marksheet_Dhanush_A_CBSE_94pct.pdf",
            "twelfth_marksheet": "12th_Diploma_Marksheet_Dhanush_A_92pct.pdf",
            "college_marksheet": "College_Consolidated_Marksheet_Dhanush_A_8.9CGPA.pdf",
            "college_name": "Madras Institute of Technology (MIT Chromepet)",
            "year_of_start": 2022,
            "year_of_end": 2026,
        },
        {
            "full_name": "Karthik Subramanian",
            "email": "karthik.s@ingage.com",
            "mobile_number": "+91 97890 12345",
            "emergency_number": "+91 99620 45678",
            "residential_address": "Plot 18, Royal Enclave, Thiruvanmiyur, Chennai - 600041",
            "home_address": "No. 7, Temple View Road, Madurai - 625001",
            "is_home_same_as_residential": False,
            "tenth_marksheet": "10th_Marksheet_Karthik_S_ICSE_89pct.pdf",
            "twelfth_marksheet": "12th_Marksheet_Karthik_S_StateBoard_90pct.pdf",
            "college_marksheet": "College_Consolidated_Marksheet_Karthik_8.4CGPA.pdf",
            "college_name": "SSN College of Engineering, Chennai",
            "year_of_start": 2021,
            "year_of_end": 2025,
        },
        {
            "full_name": "Ananya Rao",
            "email": "ananya.rao@ingage.com",
            "mobile_number": "+91 96543 21098",
            "emergency_number": "+91 97112 67890",
            "residential_address": "Villa 12, Sobha Lakeview, Bellandur, Bengaluru - 560103",
            "home_address": "Villa 12, Sobha Lakeview, Bellandur, Bengaluru - 560103",
            "is_home_same_as_residential": True,
            "tenth_marksheet": "10th_Marksheet_Ananya_Rao_96pct.pdf",
            "twelfth_marksheet": "12th_Marksheet_Ananya_Rao_94pct.pdf",
            "college_marksheet": "College_Consolidated_Marksheet_Ananya_9.1CGPA.pdf",
            "college_name": "National Institute of Technology (NIT Trichy)",
            "year_of_start": 2021,
            "year_of_end": 2025,
        },
    ]

    created_records = []
    for item in sample_items:
        # Ensure User account exists with role="intern" and password="admin123"
        intern_user = db.query(User).filter(User.email == item["email"]).first()
        if not intern_user:
            intern_user = User(
                email=item["email"],
                full_name=item["full_name"],
                password_hash=get_password_hash("admin123"),
                role="intern",
                status="Active",
                profile_status="Completed",
                current_status="On Duty",
            )
            db.add(intern_user)
            db.flush()
            tl = db.query(User).filter(User.role == "team_lead").first()
            intern_prof = UserProfile(
                user_id=intern_user.id,
                staff_category="Intern",
                intern_id=f"ING-INT-2026-{intern_user.id:04d}",
                designation="Software Developer Intern",
                department="Edutech",
                reporting_manager_id=tl.id if tl else None,
                mobile=item["mobile_number"],
                address=item["residential_address"],
                city="Chennai",
                state="Tamil Nadu",
                country="India",
            )
            db.add(intern_prof)
        else:
            intern_user.password_hash = get_password_hash("admin123")
            intern_user.role = "intern"
            intern_user.status = "Active"

        existing = db.query(InternRecord).filter(
            InternRecord.full_name == item["full_name"],
            InternRecord.mobile_number == item["mobile_number"]
        ).first()
        if not existing:
            rec = InternRecord(
                **item,
                created_by_id=current_user.id
            )
            db.add(rec)
            db.flush()
            created_records.append(rec)

    db.commit()

    return list_intern_records(search=None, current_user=current_user, db=db)

