import asyncio
import json
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_user, decode_access_token, oauth2_scheme
from app.core.notification_broadcaster import broadcaster
from app.models.domain import User
from app.models.schemas import NotificationListResponse
from app.cqrs.queries.notification_queries import GetNotificationsQuery
from app.cqrs.commands.notification_commands import (
    MarkNotificationReadCommand, MarkAllNotificationsReadCommand,
    CleanupExpiredNotificationsCommand, ToggleNotificationServiceCommand
)
from app.services.notification_cleanup_service import NotificationCleanupService
from pydantic import BaseModel

class ServiceToggleRequest(BaseModel):
    is_enabled: bool

class ServiceExecuteRequest(BaseModel):
    retention_days: Optional[int] = 90
    force: Optional[bool] = False
from app.cqrs.handlers.query_handlers import QueryHandlers
from app.cqrs.handlers.command_handlers import CommandHandlers

router = APIRouter(prefix="/notifications", tags=["Notifications"])

@router.get("/stream")
async def notification_stream(
    token: Optional[str] = Query(None),
    auth_header: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """
    Real-time Server-Sent Events (SSE) stream for user notifications.
    Clients connect once on login; events are pushed ONLY when tasks are assigned or updated.
    Eliminates client-side setInterval polling.
    """
    actual_token = token or auth_header
    if not actual_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token required"
        )
    user_id_str = decode_access_token(actual_token)
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )

    user = db.query(User).filter(User.id == int(user_id_str)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    loop = asyncio.get_running_loop()
    queue = asyncio.Queue()
    broadcaster.register(user.id, queue, loop)

    async def event_generator():
        try:
            # Send initial connected event
            yield f"event: connected\ndata: {json.dumps({'status': 'connected', 'user_id': user.id})}\n\n"
            while True:
                try:
                    # Await real-time notification; send heartbeat if idle for 25s
                    data = await asyncio.wait_for(queue.get(), timeout=25.0)
                    yield f"event: notification\ndata: {json.dumps(data)}\n\n"
                except asyncio.TimeoutError:
                    # SSE comment to keep TCP connection & proxies open without waking client logic
                    yield ": heartbeat\n\n"
        except (asyncio.CancelledError, GeneratorExit):
            pass
        finally:
            broadcaster.unregister(user.id, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )

@router.get("", response_model=NotificationListResponse)
def get_notifications(
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = GetNotificationsQuery(user_id=current_user.id, limit=limit)
    return QueryHandlers.handle_get_notifications(query, db)

@router.patch("/{notification_id}/read")
def mark_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    cmd = MarkNotificationReadCommand(notification_id=notification_id, user_id=current_user.id)
    CommandHandlers.handle_mark_notification_read(cmd, db)
    return {"success": True}

@router.post("/read-all")
def mark_all_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    cmd = MarkAllNotificationsReadCommand(user_id=current_user.id)
    CommandHandlers.handle_mark_all_notifications_read(cmd, db)
    return {"success": True}

# =====================================================================
# Notification Retention / Cleanup Application Service Endpoints
# =====================================================================

@router.get("/service/status")
def get_retention_service_status(db: Session = Depends(get_db)):
    """
    Returns telemetry and operational status for the 90-day notification cleanup service:
    - Service enabled status
    - Server current time & weekday
    - Last execution metadata (timestamp, scanned, deleted)
    - Next scheduled run (Sunday or Monday 6:00 AM retry)
    - Table counts (total rows, eligible for 90-day deletion, retained)
    - Recent execution logs
    """
    return NotificationCleanupService.get_status(db)

@router.post("/service/execute")
def trigger_retention_service_cleanup(
    payload: Optional[ServiceExecuteRequest] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Manually triggers the notification retention cleanup scan:
    - Scans 'public.notifications'
    - Verifies 'created_at' timestamp on each row
    - Deletes rows where created_at has crossed 90 or more days
    """
    retention_days = payload.retention_days if payload and payload.retention_days else 90
    force = payload.force if payload and payload.force is not None else False

    cmd = CleanupExpiredNotificationsCommand(
        retention_days=retention_days,
        trigger_type=f"MANUAL_API_USER_{current_user.id}",
        force=force
    )
    return CommandHandlers.handle_cleanup_expired_notifications(cmd, db)

@router.post("/service/toggle")
def toggle_retention_service(
    payload: ServiceToggleRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Enables or disables the 90-day notification retention cleanup service.
    If disabled on Sunday, the service will re-execute next day (Monday) morning at 6:00 AM once enabled.
    """
    cmd = ToggleNotificationServiceCommand(is_enabled=payload.is_enabled)
    return CommandHandlers.handle_toggle_notification_service(cmd, db)

@router.get("/service/logs")
def get_retention_service_logs(
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """Returns recent audit execution logs for the notification retention service."""
    from app.models.domain import ServiceExecutionLog
    logs = db.query(ServiceExecutionLog).filter(
        ServiceExecutionLog.service_name == "notification_retention_service"
    ).order_by(ServiceExecutionLog.triggered_at.desc()).limit(limit).all()

    return {
        "service_name": "notification_retention_service",
        "total_returned": len(logs),
        "logs": [
            {
                "id": l.id,
                "triggered_at": l.triggered_at.isoformat() if l.triggered_at else None,
                "trigger_type": l.trigger_type,
                "status": l.status,
                "scanned_count": l.scanned_count,
                "deleted_count": l.deleted_count,
                "threshold_date": l.threshold_date.isoformat() if l.threshold_date else None,
                "details": l.details
            }
            for l in logs
        ]
    }


