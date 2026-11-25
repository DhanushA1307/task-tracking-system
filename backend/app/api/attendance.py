from typing import Optional, List, Dict, Any
from datetime import datetime, date, time, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import desc, asc

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.domain import User, AttendanceRecord, AttendanceSetting

router = APIRouter(prefix="/attendance", tags=["Attendance"])

class MarkAttendanceRequest(BaseModel):
    action: str  # 'check_in', 'lunch', 'break', 'check_out'
    notes: Optional[str] = None

class SaturdayToggleRequest(BaseModel):
    is_working: bool

def _get_saturday_setting(db: Session) -> bool:
    setting = db.query(AttendanceSetting).filter(AttendanceSetting.setting_key == "is_saturday_working").first()
    if not setting:
        return False
    return setting.setting_value.lower() == "true"

def _format_time(dt: Optional[datetime]) -> str:
    if not dt:
        return "--"
    return dt.strftime("%I:%M %p")

def _determine_active_session(now: datetime, is_saturday_working: bool) -> Dict[str, Any]:
    weekday = now.weekday() # 0 = Monday, 4 = Friday, 5 = Saturday, 6 = Sunday
    is_saturday = (weekday == 5)
    is_sunday = (weekday == 6)

    if is_sunday:
        return {
            "session_name": "Sunday (Weekend)",
            "action_type": "weekend",
            "session_window": "Office Closed",
            "is_active_window": False,
            "next_session": "Check-in Monday 9:30 AM - 11:30 AM",
            "badge_color": "bg-slate-100 text-slate-700 border-slate-200"
        }

    if is_saturday and not is_saturday_working:
        return {
            "session_name": "Saturday (Office Off)",
            "action_type": "weekend",
            "session_window": "Optional Saturday (Not Active)",
            "is_active_window": False,
            "next_session": "Check-in Monday 9:30 AM - 11:30 AM",
            "badge_color": "bg-amber-50 text-amber-800 border-amber-200"
        }

    # Monday - Friday (or Working Saturday)
    # 1st: Check-in: 9:30 AM to 11:30 AM (9:30 - 11:30)
    # 2nd: Lunch: 12:00 PM to 4:30 PM (12:00 - 16:30)
    # 3rd: Break: 5:00 PM to 6:15 PM (17:00 - 18:15)
    # 4th / Final: Check-out: 6:30 PM to 8:30 PM (18:30 - 20:30)

    cur_time = now.time()
    t_9_30 = time(9, 30)
    t_11_30 = time(11, 30)
    t_12_00 = time(12, 0)
    t_16_30 = time(16, 30)
    t_17_00 = time(17, 0)
    t_18_15 = time(18, 15)
    t_18_30 = time(18, 30)
    t_20_30 = time(20, 30)

    if cur_time < t_9_30:
        return {
            "session_name": "Check-in (Early / Upcoming)",
            "action_type": "check_in",
            "session_window": "9:30 AM - 11:30 AM",
            "is_active_window": True,
            "next_session": "Check-in starts at 9:30 AM",
            "badge_color": "bg-emerald-50 text-emerald-800 border-emerald-200"
        }
    elif t_9_30 <= cur_time <= t_11_30:
        return {
            "session_name": "Check-in",
            "action_type": "check_in",
            "session_window": "9:30 AM - 11:30 AM",
            "is_active_window": True,
            "next_session": "Lunch starts at 12:00 PM",
            "badge_color": "bg-emerald-50 text-emerald-800 border-emerald-200"
        }
    elif t_11_30 < cur_time < t_12_00:
        return {
            "session_name": "Work Session",
            "action_type": "work",
            "session_window": "11:30 AM - 12:00 PM",
            "is_active_window": False,
            "next_session": "Lunch starts at 12:00 PM",
            "badge_color": "bg-blue-50 text-blue-800 border-blue-200"
        }
    elif t_12_00 <= cur_time <= t_16_30:
        return {
            "session_name": "Lunch",
            "action_type": "lunch",
            "session_window": "12:00 PM - 4:30 PM",
            "is_active_window": True,
            "next_session": "Break starts at 5:00 PM",
            "badge_color": "bg-amber-50 text-amber-800 border-amber-200"
        }
    elif t_16_30 < cur_time < t_17_00:
        return {
            "session_name": "Work Session",
            "action_type": "work",
            "session_window": "4:30 PM - 5:00 PM",
            "is_active_window": False,
            "next_session": "Break starts at 5:00 PM",
            "badge_color": "bg-blue-50 text-blue-800 border-blue-200"
        }
    elif t_17_00 <= cur_time <= t_18_15:
        return {
            "session_name": "Break",
            "action_type": "break",
            "session_window": "5:00 PM - 6:15 PM",
            "is_active_window": True,
            "next_session": "Check-out starts at 6:30 PM",
            "badge_color": "bg-purple-50 text-purple-800 border-purple-200"
        }
    elif t_18_15 < cur_time < t_18_30:
        return {
            "session_name": "Work Session",
            "action_type": "work",
            "session_window": "6:15 PM - 6:30 PM",
            "is_active_window": False,
            "next_session": "Check-out starts at 6:30 PM",
            "badge_color": "bg-blue-50 text-blue-800 border-blue-200"
        }
    elif t_18_30 <= cur_time <= t_20_30:
        return {
            "session_name": "Check-out",
            "action_type": "check_out",
            "session_window": "6:30 PM - 8:30 PM",
            "is_active_window": True,
            "next_session": "End of working day",
            "badge_color": "bg-rose-50 text-rose-800 border-rose-200"
        }
    else:
        return {
            "session_name": "Overtime / Day Ended",
            "action_type": "check_out",
            "session_window": "Post 8:30 PM",
            "is_active_window": True,
            "next_session": "Tomorrow: Check-in at 9:30 AM",
            "badge_color": "bg-slate-100 text-slate-800 border-slate-200"
        }


def _record_to_dict(rec: AttendanceRecord) -> Dict[str, Any]:
    return {
        "id": rec.id,
        "user_id": rec.user_id,
        "date": rec.date.isoformat(),
        "day_name": rec.date.strftime("%A"),
        "formatted_date": rec.date.strftime("%d %b %Y"),
        "check_in": _format_time(rec.check_in),
        "check_in_raw": rec.check_in.isoformat() if rec.check_in else None,
        "lunch_start": _format_time(rec.lunch_start),
        "lunch_end": _format_time(rec.lunch_end),
        "lunch_session": f"{_format_time(rec.lunch_start)} - {_format_time(rec.lunch_end)}" if (rec.lunch_start and rec.lunch_end) else (_format_time(rec.lunch_start) if rec.lunch_start else "--"),
        "break_start": _format_time(rec.break_start),
        "break_end": _format_time(rec.break_end),
        "break_session": f"{_format_time(rec.break_start)} - {_format_time(rec.break_end)}" if (rec.break_start and rec.break_end) else (_format_time(rec.break_start) if rec.break_start else "--"),
        "check_out": _format_time(rec.check_out),
        "check_out_raw": rec.check_out.isoformat() if rec.check_out else None,
        "total_hours": round(rec.total_hours, 2),
        "status": rec.status,
        "session_stage": rec.session_stage,
        "notes": rec.notes
    }


@router.get("/today")
def get_today_attendance(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns today's attendance record and current dynamic session state for the user.
    """
    today = date.today()
    now = datetime.now()
    is_sat_working = _get_saturday_setting(db)

    # Find or create today's record
    record = db.query(AttendanceRecord).filter(
        AttendanceRecord.user_id == current_user.id,
        AttendanceRecord.date == today
    ).first()

    if not record:
        weekday = today.weekday()
        initial_status = "Present" if weekday < 5 or (weekday == 5 and is_sat_working) else "Weekend"
        record = AttendanceRecord(
            user_id=current_user.id,
            date=today,
            status=initial_status,
            session_stage="not_started",
            total_hours=0.0
        )
        db.add(record)
        db.commit()
        db.refresh(record)

    session_info = _determine_active_session(now, is_sat_working)

    return {
        "user_id": current_user.id,
        "user_name": current_user.full_name,
        "user_role": current_user.role,
        "today_date": today.isoformat(),
        "today_formatted": now.strftime("%A, %d %b %Y"),
        "current_time_formatted": now.strftime("%I:%M %p"),
        "record": _record_to_dict(record),
        "active_session": session_info,
        "is_saturday_working": is_sat_working,
    }


@router.post("/mark")
def mark_attendance(
    payload: MarkAttendanceRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Marks the dynamic attendance session: check_in, lunch, break, or check_out.
    """
    user_role_norm = current_user.role.lower().replace(" ", "_")
    if user_role_norm in ["super_admin", "superadmin"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Superadmin role is exempt from manual attendance mark punch."
        )

    today = date.today()
    now = datetime.now()
    action = payload.action.lower()

    record = db.query(AttendanceRecord).filter(
        AttendanceRecord.user_id == current_user.id,
        AttendanceRecord.date == today
    ).first()

    if not record:
        record = AttendanceRecord(
            user_id=current_user.id,
            date=today,
            status="Present",
            session_stage="not_started",
            total_hours=0.0
        )
        db.add(record)
        db.commit()
        db.refresh(record)

    if action == "check_in":
        if not record.check_in:
            record.check_in = now
        record.session_stage = "checked_in"
        record.status = "Present"
        if payload.notes:
            record.notes = payload.notes

    elif action == "lunch":
        if not record.lunch_start:
            record.lunch_start = now
            record.session_stage = "lunch"
        elif not record.lunch_end:
            record.lunch_end = now
            record.session_stage = "checked_in"

    elif action == "break":
        if not record.break_start:
            record.break_start = now
            record.session_stage = "break"
        elif not record.break_end:
            record.break_end = now
            record.session_stage = "checked_in"

    elif action == "check_out":
        record.check_out = now
        record.session_stage = "checked_out"

        # Calculate working hours
        if record.check_in:
            total_seconds = (record.check_out - record.check_in).total_seconds()
            
            # Deduct lunch if both recorded
            if record.lunch_start and record.lunch_end:
                lunch_seconds = (record.lunch_end - record.lunch_start).total_seconds()
                total_seconds -= max(0, lunch_seconds)
            elif record.lunch_start and not record.lunch_end:
                record.lunch_end = record.lunch_start + timedelta(minutes=45)
                total_seconds -= 45 * 60

            # Deduct break if both recorded
            if record.break_start and record.break_end:
                break_seconds = (record.break_end - record.break_start).total_seconds()
                total_seconds -= max(0, break_seconds)

            hrs = max(0.0, total_seconds / 3600.0)
            record.total_hours = round(hrs, 2)
        else:
            record.total_hours = 8.0

    else:
        raise HTTPException(status_code=400, detail=f"Invalid attendance action '{action}'")

    db.commit()
    db.refresh(record)

    is_sat_working = _get_saturday_setting(db)
    session_info = _determine_active_session(now, is_sat_working)

    return {
        "success": True,
        "message": f"Successfully marked {action.replace('_', ' ').title()}",
        "record": _record_to_dict(record),
        "active_session": session_info,
    }


@router.get("/my")
def get_my_attendance(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns user's everyday attendance in reverse chronological order with pagination.
    """
    query = db.query(AttendanceRecord).filter(
        AttendanceRecord.user_id == current_user.id
    ).order_by(desc(AttendanceRecord.date))

    total = query.count()
    records = query.offset((page - 1) * page_size).limit(page_size).all()

    items = [_record_to_dict(r) for r in records]
    total_pages = max(1, (total + page_size - 1) // page_size)

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


@router.get("/team")
def get_team_attendance(
    date_str: Optional[str] = Query(None, description="Selected date YYYY-MM-DD"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns all employees' attendance records for a specific date in ascending order of names.
    Exclusively restricted to Superadmin and Admin.
    """
    user_role_norm = current_user.role.lower().replace(" ", "_")
    if user_role_norm not in ["super_admin", "superadmin", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Team Attendance view is exclusively accessible to Superadmin and Admin roles."
        )

    if date_str:
        try:
            target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            target_date = date.today()
    else:
        target_date = date.today()

    is_sat_working = _get_saturday_setting(db)

    # Fetch all employees in ascending order of full_name (A -> Z)
    all_users = db.query(User).order_by(asc(User.full_name)).all()

    # Fetch attendance records for target_date
    existing_records = db.query(AttendanceRecord).filter(
        AttendanceRecord.date == target_date
    ).all()
    records_by_uid = {r.user_id: r for r in existing_records}

    employee_rows = []
    present_count = 0
    checked_in_count = 0
    on_duty_count = 0

    weekday = target_date.weekday()
    is_weekend = (weekday == 6) or (weekday == 5 and not is_sat_working)

    for u in all_users:
        rec = records_by_uid.get(u.id)
        prof = u.profile
        desig_name = prof.designation if (prof and prof.designation) else u.role.replace("_", " ").title()
        avatar = prof.profile_photo if prof else None

        if rec:
            ci = _format_time(rec.check_in)
            ls = f"{_format_time(rec.lunch_start)} - {_format_time(rec.lunch_end)}" if (rec.lunch_start and rec.lunch_end) else (_format_time(rec.lunch_start) if rec.lunch_start else "--")
            bs = f"{_format_time(rec.break_start)} - {_format_time(rec.break_end)}" if (rec.break_start and rec.break_end) else (_format_time(rec.break_start) if rec.break_start else "--")
            co = _format_time(rec.check_out)
            hours = round(rec.total_hours, 2)
            st = rec.status
            stage = rec.session_stage
        else:
            ci = "--"
            ls = "--"
            bs = "--"
            co = "--"
            hours = 0.0
            st = "Weekend" if is_weekend else "Pending"
            stage = "not_started"

        if st in ["Present", "On Duty", "Saturday Working"]:
            present_count += 1
        if stage in ["checked_in", "lunch", "break"]:
            checked_in_count += 1
        if u.current_status == "On Duty":
            on_duty_count += 1

        employee_rows.append({
            "employee_id": u.id,
            "employee_name": u.full_name or u.email.split("@")[0].title(),
            "employee_email": u.email,
            "role": u.role,
            "designation": desig_name,
            "avatar": avatar,
            "date": target_date.isoformat(),
            "check_in": ci,
            "lunch": ls,
            "break": bs,
            "check_out": co,
            "total_hours": hours,
            "status": st,
            "session_stage": stage,
            "current_duty_status": u.current_status or "On Duty",
        })

    return {
        "selected_date": target_date.isoformat(),
        "selected_date_formatted": target_date.strftime("%A, %d %b %Y"),
        "is_saturday_working": is_sat_working,
        "is_weekend": is_weekend,
        "summary": {
            "total_employees": len(all_users),
            "present_count": present_count,
            "checked_in_count": checked_in_count,
            "on_duty_count": on_duty_count,
            "pending_count": max(0, len(all_users) - present_count),
        },
        "employees": employee_rows,
    }


@router.post("/saturday-toggle")
def toggle_saturday_office(
    payload: SaturdayToggleRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Exclusively allows Superadmin and Admin to toggle whether Saturday is an office working day.
    """
    user_role_norm = current_user.role.lower().replace(" ", "_")
    if user_role_norm not in ["super_admin", "superadmin", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Exclusively restricted to Superadmin and Admin roles."
        )

    setting = db.query(AttendanceSetting).filter(AttendanceSetting.setting_key == "is_saturday_working").first()
    new_val = "true" if payload.is_working else "false"

    if not setting:
        setting = AttendanceSetting(
            setting_key="is_saturday_working",
            setting_value=new_val,
            updated_by_id=current_user.id
        )
        db.add(setting)
    else:
        setting.setting_value = new_val
        setting.updated_by_id = current_user.id

    db.commit()

    return {
        "success": True,
        "is_saturday_working": payload.is_working,
        "message": f"Saturday office working status set to {'ACTIVE (Office Open)' if payload.is_working else 'OFF (Weekend)'}."
    }
