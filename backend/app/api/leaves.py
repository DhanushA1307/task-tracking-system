from datetime import date, datetime, timezone
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.notification_broadcaster import broadcaster
from app.models.domain import User, LeavePolicy, LeaveRequest, LeaveRecipient, Notification

router = APIRouter(prefix="/leaves", tags=["Leave Management"])

DEFAULT_LEAVE_POLICIES = [
    {
        "leave_key": "single_day",
        "label": "Single Day Leave",
        "description": "One full calendar day off.",
        "max_days_limit": 4.0,
    },
    {
        "leave_key": "half_day",
        "label": "Half Day Leave",
        "description": "Morning or afternoon half-day leave (0.5 day).",
        "max_days_limit": 4.0,
    },
    {
        "leave_key": "consecutive_days",
        "label": "Consecutive Days Leave",
        "description": "Continuous multi-day leave across a date range.",
        "max_days_limit": 7.0,
    },
    {
        "leave_key": "selective_days",
        "label": "Selective Days Leave",
        "description": "Non-consecutive specific dates chosen by the applicant.",
        "max_days_limit": 5.0,
    },
    {
        "leave_key": "emergency_leave",
        "label": "Emergency Leave",
        "description": "Urgent unplanned leave for personal or family emergencies.",
        "max_days_limit": 3.0,
    },
    {
        "leave_key": "sick_leave",
        "label": "Sick Leave",
        "description": "Medical or health-related leave.",
        "max_days_limit": 6.0,
    },
]


class PolicyLimitItem(BaseModel):
    leave_key: str
    max_days_limit: float = Field(..., ge=0.0, le=365.0)


class UpdateLeavePoliciesRequest(BaseModel):
    policies: List[PolicyLimitItem]


class ApplyLeaveRequest(BaseModel):
    leave_category: str = Field(default="regular")  # regular, emergency_leave, sick_leave
    duration_mode: str = Field(default="single_day")  # single_day, half_day, consecutive_days, selective_days
    half_day_slot: Optional[str] = None  # morning, afternoon
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    selected_dates: Optional[List[date]] = None
    reason: str = Field(..., min_length=3, max_length=1000)


class LeaveDecisionRequest(BaseModel):
    decision: str  # Approved | Rejected
    remarks: Optional[str] = None


def _norm_role(role: Optional[str]) -> str:
    return (role or "").strip().lower().replace(" ", "_")


def _ensure_default_policies(db: Session) -> List[LeavePolicy]:
    existing = {p.leave_key: p for p in db.query(LeavePolicy).all()}
    created = False
    for item in DEFAULT_LEAVE_POLICIES:
        if item["leave_key"] not in existing:
            db.add(LeavePolicy(**item))
            created = True
    if created:
        db.commit()
    order = {item["leave_key"]: idx for idx, item in enumerate(DEFAULT_LEAVE_POLICIES)}
    rows = db.query(LeavePolicy).all()
    rows.sort(key=lambda r: order.get(r.leave_key, 99))
    return rows


def _compute_used_by_key(user_id: int, db: Session) -> Dict[str, float]:
    used: Dict[str, float] = {item["leave_key"]: 0.0 for item in DEFAULT_LEAVE_POLICIES}
    reqs = (
        db.query(LeaveRequest)
        .filter(
            LeaveRequest.user_id == user_id,
            LeaveRequest.status.in_(["Pending", "Approved"]),
        )
        .all()
    )
    for req in reqs:
        days = float(req.total_days or 0.0)
        if req.duration_mode in used:
            used[req.duration_mode] += days
        if req.leave_category in used:
            used[req.leave_category] += days
    return used


def _resolve_three_recipients(applicant: User, db: Session) -> List[Dict[str, Any]]:
    """
    Strictly resolve up to 3 designated recipients:
      1. Super Admin
      2. Admin (walked up applicant's reporting_manager_id chain)
      3. Corresponding Higher Officer (immediate reporting_manager_id)
    """
    all_users = {u.id: u for u in db.query(User).all()}
    super_admin = next(
        (u for u in all_users.values() if _norm_role(u.role) in ["super_admin", "superadmin"] and u.id != applicant.id),
        None,
    )

    # Walk upward along reporting_manager_id to find immediate higher officer & branch admin
    higher_officer = None
    branch_admin = None
    visited = {applicant.id}
    curr = applicant
    step = 0
    while curr and curr.profile and curr.profile.reporting_manager_id and step < 10:
        mgr_id = curr.profile.reporting_manager_id
        if mgr_id in visited:
            break
        visited.add(mgr_id)
        mgr = all_users.get(mgr_id)
        if not mgr:
            break
        if step == 0:
            higher_officer = mgr
        if _norm_role(mgr.role) == "admin" and branch_admin is None:
            branch_admin = mgr
        curr = mgr
        step += 1

    # Fallback only if applicant itself is a top-level non-admin without a branch admin in chain
    if branch_admin is None and _norm_role(applicant.role) not in ["admin", "hr", "human_resource_manager"]:
        branch_admin = next(
            (u for u in all_users.values() if _norm_role(u.role) == "admin" and u.id != applicant.id),
            None,
        )

    tiers = [
        ("super_admin", super_admin),
        ("admin", branch_admin),
        ("higher_officer", higher_officer),
    ]

    resolved: List[Dict[str, Any]] = []
    seen_ids = set()
    for tier_name, target in tiers:
        if target and target.id != applicant.id and target.id not in seen_ids:
            seen_ids.add(target.id)
            resolved.append({
                "user": target,
                "tier": tier_name,
            })
    return resolved


def _serialize_leave_request(req: LeaveRequest) -> Dict[str, Any]:
    applicant = req.applicant
    return {
        "id": req.id,
        "user_id": req.user_id,
        "applicant_name": applicant.full_name if applicant else "User",
        "applicant_email": applicant.email if applicant else "",
        "applicant_role": applicant.role if applicant else "",
        "applicant_designation": (
            applicant.profile.designation
            if applicant and applicant.profile and applicant.profile.designation
            else (applicant.role.replace("_", " ").title() if applicant else "")
        ),
        "leave_category": req.leave_category,
        "duration_mode": req.duration_mode,
        "half_day_slot": req.half_day_slot,
        "start_date": req.start_date.isoformat() if req.start_date else None,
        "end_date": req.end_date.isoformat() if req.end_date else None,
        "selected_dates": req.selected_dates or [],
        "total_days": req.total_days,
        "reason": req.reason,
        "status": req.status,
        "reviewer_remarks": req.reviewer_remarks,
        "reviewed_by_name": req.reviewed_by.full_name if req.reviewed_by else None,
        "reviewed_at": req.reviewed_at.isoformat() if req.reviewed_at else None,
        "created_at": req.created_at.isoformat() if req.created_at else None,
        "recipients": [
            {
                "user_id": r.recipient_user_id,
                "name": r.recipient.full_name if r.recipient else "Officer",
                "role": r.recipient.role if r.recipient else "",
                "tier": r.recipient_tier,
                "decision": r.decision,
                "remarks": r.remarks,
                "acted_at": r.acted_at.isoformat() if r.acted_at else None,
            }
            for r in req.recipients
        ],
    }


@router.get("/policies")
def get_leave_policies(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    policies = _ensure_default_policies(db)
    used_map = _compute_used_by_key(current_user.id, db)
    role_norm = _norm_role(current_user.role)
    is_super_admin = role_norm in ["super_admin", "superadmin"]

    preview_recipients = _resolve_three_recipients(current_user, db)

    return {
        "can_customize_limits": is_super_admin,
        "can_apply_leave": not is_super_admin,
        "policies": [
            {
                "leave_key": p.leave_key,
                "label": p.label,
                "description": p.description,
                "max_days_limit": p.max_days_limit,
                "used_days": round(used_map.get(p.leave_key, 0.0), 2),
                "remaining_days": round(max(0.0, p.max_days_limit - used_map.get(p.leave_key, 0.0)), 2),
                "updated_at": p.updated_at.isoformat() if p.updated_at else None,
            }
            for p in policies
        ],
        "routing_recipients": [
            {
                "user_id": item["user"].id,
                "name": item["user"].full_name,
                "role": item["user"].role,
                "tier": item["tier"],
            }
            for item in preview_recipients
        ],
    }


@router.put("/policies")
def update_leave_policies(
    payload: UpdateLeavePoliciesRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if _norm_role(current_user.role) not in ["super_admin", "superadmin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Super Admin can customize leave count limits.",
        )

    policies = {p.leave_key: p for p in _ensure_default_policies(db)}
    for item in payload.policies:
        pol = policies.get(item.leave_key)
        if not pol:
            raise HTTPException(status_code=404, detail=f"Unknown leave policy '{item.leave_key}'")
        pol.max_days_limit = float(item.max_days_limit)
        pol.updated_by_id = current_user.id
        pol.updated_at = datetime.now(timezone.utc)

    db.commit()
    return {
        "success": True,
        "message": "Leave count limits updated successfully.",
    }


@router.post("/apply", status_code=status.HTTP_201_CREATED)
def apply_for_leave(
    payload: ApplyLeaveRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if _norm_role(current_user.role) in ["super_admin", "superadmin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super Admin customizes leave limits and reviews requests; other designations apply for leave.",
        )

    valid_categories = {"regular", "emergency_leave", "sick_leave"}
    valid_modes = {"single_day", "half_day", "consecutive_days", "selective_days"}
    if payload.leave_category not in valid_categories:
        raise HTTPException(status_code=400, detail="Invalid leave_category.")
    if payload.duration_mode not in valid_modes:
        raise HTTPException(status_code=400, detail="Invalid duration_mode.")

    start_d = payload.start_date
    end_d = payload.end_date
    selected_strs: List[str] = []
    half_slot = None

    if payload.duration_mode == "single_day":
        if not start_d:
            raise HTTPException(status_code=400, detail="Please select a date for Single Day leave.")
        end_d = start_d
        total_days = 1.0
    elif payload.duration_mode == "half_day":
        if not start_d:
            raise HTTPException(status_code=400, detail="Please select a date for Half Day leave.")
        half_slot = (payload.half_day_slot or "morning").lower()
        if half_slot not in {"morning", "afternoon"}:
            raise HTTPException(status_code=400, detail="Half day slot must be 'morning' or 'afternoon'.")
        end_d = start_d
        total_days = 0.5
    elif payload.duration_mode == "consecutive_days":
        if not start_d or not end_d:
            raise HTTPException(status_code=400, detail="Please select both start and end dates for Consecutive Days leave.")
        if end_d < start_d:
            raise HTTPException(status_code=400, detail="End date cannot be earlier than start date.")
        total_days = float((end_d - start_d).days + 1)
    else:  # selective_days
        if not payload.selected_dates:
            raise HTTPException(status_code=400, detail="Please pick at least one date for Selective Days leave.")
        unique_dates = sorted(set(payload.selected_dates))
        selected_strs = [d.isoformat() for d in unique_dates]
        start_d = unique_dates[0]
        end_d = unique_dates[-1]
        total_days = float(len(unique_dates))

    # Enforce Super Admin's configured limits
    policies = {p.leave_key: p for p in _ensure_default_policies(db)}
    used_map = _compute_used_by_key(current_user.id, db)

    mode_policy = policies.get(payload.duration_mode)
    if mode_policy and (used_map.get(payload.duration_mode, 0.0) + total_days > mode_policy.max_days_limit):
        remaining = max(0.0, mode_policy.max_days_limit - used_map.get(payload.duration_mode, 0.0))
        raise HTTPException(
            status_code=400,
            detail=f"{mode_policy.label} limit exceeded. Limit: {mode_policy.max_days_limit} days, Remaining: {remaining} days.",
        )

    if payload.leave_category in ("emergency_leave", "sick_leave"):
        cat_policy = policies.get(payload.leave_category)
        if cat_policy and (used_map.get(payload.leave_category, 0.0) + total_days > cat_policy.max_days_limit):
            remaining = max(0.0, cat_policy.max_days_limit - used_map.get(payload.leave_category, 0.0))
            raise HTTPException(
                status_code=400,
                detail=f"{cat_policy.label} limit exceeded. Limit: {cat_policy.max_days_limit} days, Remaining: {remaining} days.",
            )

    leave_req = LeaveRequest(
        user_id=current_user.id,
        leave_category=payload.leave_category,
        duration_mode=payload.duration_mode,
        half_day_slot=half_slot,
        start_date=start_d,
        end_date=end_d,
        selected_dates=selected_strs or None,
        total_days=total_days,
        reason=payload.reason.strip(),
        status="Pending",
    )
    db.add(leave_req)
    db.flush()

    recipients = _resolve_three_recipients(current_user, db)
    for rec in recipients:
        target_user = rec["user"]
        db.add(LeaveRecipient(
            leave_request_id=leave_req.id,
            recipient_user_id=target_user.id,
            recipient_tier=rec["tier"],
            decision="Pending",
        ))
        db.add(Notification(
            user_id=target_user.id,
            title="New Leave Application",
            message=f"{current_user.full_name or current_user.email} applied for {total_days} day(s) ({payload.duration_mode.replace('_', ' ')}).",
            link="#leave",
            notification_type="leave_request",
        ))

    db.commit()
    db.refresh(leave_req)

    # Real-time SSE broadcast to the 3 designated recipients only
    for rec in recipients:
        uid = rec["user"].id
        try:
            unread = db.query(Notification).filter(
                Notification.user_id == uid,
                Notification.is_read == False,
            ).count()
            broadcaster.broadcast(
                user_id=uid,
                payload={
                    "type": "leave_request",
                    "title": "New Leave Application",
                    "message": f"{current_user.full_name or current_user.email} applied for {total_days} day(s).",
                    "unread_count": unread,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                },
            )
        except Exception:
            pass

    return {
        "success": True,
        "message": "Leave application submitted to designated officers.",
        "leave": _serialize_leave_request(leave_req),
    }


@router.get("/my")
def get_my_leaves(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(LeaveRequest)
        .filter(LeaveRequest.user_id == current_user.id)
        .order_by(LeaveRequest.created_at.desc())
        .all()
    )
    return {"items": [_serialize_leave_request(r) for r in rows]}


@router.get("/incoming")
def get_incoming_leave_requests(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Strictly returns ONLY leave requests routed to current_user as one of the 3 designated recipients:
    1) Super Admin, 2) Branch Admin, or 3) Corresponding Higher Officer.
    """
    reqs = (
        db.query(LeaveRequest)
        .join(LeaveRecipient, LeaveRecipient.leave_request_id == LeaveRequest.id)
        .filter(LeaveRecipient.recipient_user_id == current_user.id)
        .order_by(LeaveRequest.created_at.desc())
        .all()
    )
    return {"items": [_serialize_leave_request(r) for r in reqs]}


@router.patch("/{leave_id}/decision")
def decide_leave_request(
    leave_id: int,
    payload: LeaveDecisionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    decision_norm = payload.decision.strip().title()
    if decision_norm not in {"Approved", "Rejected"}:
        raise HTTPException(status_code=400, detail="Decision must be 'Approved' or 'Rejected'.")

    recipient_row = (
        db.query(LeaveRecipient)
        .filter(
            LeaveRecipient.leave_request_id == leave_id,
            LeaveRecipient.recipient_user_id == current_user.id,
        )
        .first()
    )
    if not recipient_row:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not one of the 3 designated officers for this leave request.",
        )

    leave_req = db.query(LeaveRequest).filter(LeaveRequest.id == leave_id).first()
    if not leave_req:
        raise HTTPException(status_code=404, detail="Leave request not found.")

    now = datetime.now(timezone.utc)
    recipient_row.decision = decision_norm
    recipient_row.remarks = payload.remarks
    recipient_row.acted_at = now

    leave_req.status = decision_norm
    leave_req.reviewed_by_id = current_user.id
    leave_req.reviewer_remarks = payload.remarks
    leave_req.reviewed_at = now

    db.add(Notification(
        user_id=leave_req.user_id,
        title=f"Leave {decision_norm}",
        message=f"Your leave request ({leave_req.total_days} day(s)) was {decision_norm.lower()} by {current_user.full_name or current_user.email}.",
        link="#leave",
        notification_type="leave_decision",
    ))
    db.commit()
    db.refresh(leave_req)

    return {
        "success": True,
        "message": f"Leave request {decision_norm.lower()}.",
        "leave": _serialize_leave_request(leave_req),
    }
