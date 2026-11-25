"""
Notification Cleanup Application Service
=========================================
Scans the 'public.notifications' table, verifies the 'created_at' timestamp
for every row, and deletes rows where created_at has crossed 90 or more days.

Execution Schedule Rules:
- Primary: Executes every Sunday.
- Fallback / Catch-up: If the service is disabled or not executed on Sunday,
  it re-executes the next day (Monday) morning at 6:00 AM.
- Manual / API: Can be executed, checked, or toggled on demand.
"""

import sys
import json
import logging
from datetime import datetime, date, time, timedelta, timezone
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import SessionLocal
from app.models.domain import Notification, ServiceExecutionState, ServiceExecutionLog
from app.core.notification_broadcaster import broadcaster

logger = logging.getLogger("notification_cleanup_service")

SERVICE_NAME = "notification_retention_service"
DEFAULT_RETENTION_DAYS = 90


class NotificationCleanupService:
    """Application Service managing the 90-day retention cleanup of public.notifications."""

    @staticmethod
    def get_or_create_state(db: Session) -> ServiceExecutionState:
        """Retrieves or initializes the service execution state record."""
        state = db.query(ServiceExecutionState).filter(
            ServiceExecutionState.service_name == SERVICE_NAME
        ).first()
        if not state:
            state = ServiceExecutionState(
                service_name=SERVICE_NAME,
                is_enabled=True,
                last_executed_at=None,
                last_execution_status="INITIALIZED",
                last_execution_type=None,
                last_deleted_count=0,
                last_scanned_count=0,
                last_error_message=None
            )
            db.add(state)
            db.commit()
            db.refresh(state)
        return state

    @classmethod
    def set_service_enabled(cls, db: Session, is_enabled: bool) -> Dict[str, Any]:
        """Enables or disables the notification retention cleanup service."""
        state = cls.get_or_create_state(db)
        state.is_enabled = is_enabled
        db.commit()
        db.refresh(state)
        logger.info(f"[{SERVICE_NAME}] Service enabled status set to: {is_enabled}")
        return {
            "service_name": SERVICE_NAME,
            "is_enabled": state.is_enabled,
            "message": f"Notification retention service is now {'enabled' if is_enabled else 'disabled'}."
        }

    @classmethod
    def scan_and_cleanup(
        cls,
        db: Session,
        retention_days: int = DEFAULT_RETENTION_DAYS,
        trigger_type: str = "MANUAL",
        force: bool = False
    ) -> Dict[str, Any]:
        """
        Scans the 'public.notifications' table.
        For every row in the table, verifies the timestamp on 'created_at'.
        If created_at has crossed 90 or more days (created_at <= now - 90 days),
        deletes the entire row.
        """
        state = cls.get_or_create_state(db)
        now_utc = datetime.now(timezone.utc)
        now_local = datetime.now().astimezone()

        # Check if service is disabled and not forced
        if not state.is_enabled and not force:
            logger.warning(f"[{SERVICE_NAME}] Execution skipped: service is currently disabled.")
            log_entry = ServiceExecutionLog(
                service_name=SERVICE_NAME,
                triggered_at=now_utc,
                trigger_type=trigger_type,
                status="SKIPPED_DISABLED",
                scanned_count=0,
                deleted_count=0,
                threshold_date=now_utc - timedelta(days=retention_days),
                details=json.dumps({"reason": "Service is disabled by configuration"})
            )
            db.add(log_entry)
            state.last_execution_status = "SKIPPED_DISABLED"
            state.last_execution_type = trigger_type
            db.commit()
            return {
                "status": "SKIPPED_DISABLED",
                "service_name": SERVICE_NAME,
                "is_enabled": False,
                "message": "Service is disabled. Cleanup execution was skipped.",
                "trigger_type": trigger_type,
                "timestamp": now_local.isoformat()
            }

        threshold_date = now_utc - timedelta(days=retention_days)

        try:
            # 1. Scan public.notifications table row by row (only id, user_id, task_id, created_at)
            all_notifications = db.query(
                Notification.id,
                Notification.user_id,
                Notification.task_id,
                Notification.created_at
            ).order_by(Notification.created_at.asc()).all()
            scanned_count = len(all_notifications)

            rows_to_delete: List[int] = []
            deleted_summary: List[Dict[str, Any]] = []
            affected_user_ids = set()

            for notif in all_notifications:
                if notif.created_at is None:
                    continue

                row_created_ts = notif.created_at
                if row_created_ts.tzinfo is None:
                    row_created_ts = row_created_ts.replace(tzinfo=timezone.utc)

                # Verification: Has the timestamp on column 'created_at' crossed 90 or more than 90 days?
                age = now_utc - row_created_ts
                if age >= timedelta(days=retention_days):
                    # Row crossed 90 or more days -> schedule entire row for deletion
                    age_in_days = round(age.total_seconds() / 86400.0, 2)
                    rows_to_delete.append(notif.id)
                    affected_user_ids.add(notif.user_id)
                    deleted_summary.append({
                        "id": notif.id,
                        "user_id": notif.user_id,
                        "task_id": notif.task_id,
                        "created_at": notif.created_at.isoformat(),
                        "age_days": age_in_days
                    })

            # 2. Delete verified rows from public.notifications
            deleted_count = len(rows_to_delete)
            if rows_to_delete:
                db.query(Notification).filter(Notification.id.in_(rows_to_delete)).delete(synchronize_session=False)

            # 3. Update execution state & audit log
            state.last_executed_at = now_utc
            state.last_execution_status = "SUCCESS"
            state.last_execution_type = trigger_type
            state.last_deleted_count = deleted_count
            state.last_scanned_count = scanned_count
            state.last_error_message = None

            log_entry = ServiceExecutionLog(
                service_name=SERVICE_NAME,
                triggered_at=now_utc,
                trigger_type=trigger_type,
                status="SUCCESS",
                scanned_count=scanned_count,
                deleted_count=deleted_count,
                threshold_date=threshold_date,
                details=json.dumps({
                    "retention_days": retention_days,
                    "deleted_count": deleted_count,
                    "retained_count": scanned_count - deleted_count,
                    "deleted_sample": deleted_summary[:20]  # Store up to 20 samples in log
                })
            )
            db.add(log_entry)
            db.commit()
            db.refresh(state)

            # 4. Broadcast live notification count updates via SSE to affected users
            try:
                for u_id in affected_user_ids:
                    unread = db.query(Notification).filter(
                        Notification.user_id == u_id,
                        Notification.is_read == False
                    ).count()
                    broadcaster.broadcast(
                        user_id=u_id,
                        payload={"type": "count_update", "unread_count": unread}
                    )
            except Exception as b_err:
                logger.warning(f"[{SERVICE_NAME}] Broadcast notice warning: {b_err}")

            logger.info(
                f"[{SERVICE_NAME}] {trigger_type} scan completed: {scanned_count} scanned, "
                f"{deleted_count} deleted (>={retention_days} days old), "
                f"{scanned_count - deleted_count} retained."
            )

            return {
                "status": "SUCCESS",
                "service_name": SERVICE_NAME,
                "is_enabled": state.is_enabled,
                "trigger_type": trigger_type,
                "scanned_count": scanned_count,
                "deleted_count": deleted_count,
                "retained_count": scanned_count - deleted_count,
                "retention_days": retention_days,
                "threshold_date": threshold_date.isoformat(),
                "executed_at": now_local.isoformat(),
                "deleted_records": deleted_summary
            }

        except Exception as e:
            db.rollback()
            logger.error(f"[{SERVICE_NAME}] Cleanup error: {e}", exc_info=True)
            state.last_execution_status = "FAILED"
            state.last_execution_type = trigger_type
            state.last_error_message = str(e)

            log_entry = ServiceExecutionLog(
                service_name=SERVICE_NAME,
                triggered_at=now_utc,
                trigger_type=trigger_type,
                status="FAILED",
                scanned_count=0,
                deleted_count=0,
                threshold_date=threshold_date,
                details=json.dumps({"error": str(e)})
            )
            db.add(log_entry)
            db.commit()

            return {
                "status": "FAILED",
                "service_name": SERVICE_NAME,
                "trigger_type": trigger_type,
                "error": str(e),
                "timestamp": now_local.isoformat()
            }

    @classmethod
    def evaluate_schedule_trigger(
        cls,
        db: Session,
        current_time: Optional[datetime] = None
    ) -> Optional[str]:
        """
        Evaluates whether a scheduled execution should fire right now:
        1. Sunday Execution: Every Sunday (weekday == 6).
        2. Monday 6:00 AM Fallback: If service was disabled or not executed on Sunday,
           it re-executes the next day (Monday) morning at 6:00 AM (weekday == 0 and hour >= 6).

        Returns:
            "SUNDAY_SCHEDULED" if Sunday run is due.
            "MONDAY_6AM_RETRY" if Monday 6 AM retry is due.
            None if no scheduled run is due at this moment.
        """
        state = cls.get_or_create_state(db)
        now_local = current_time or datetime.now().astimezone()
        weekday = now_local.weekday()  # 0=Monday, 1=Tuesday, ..., 6=Sunday
        today_date = now_local.date()

        # Compute the reference Sunday for this cycle
        if weekday == 6:
            # Today is Sunday
            current_cycle_sunday = today_date
        elif weekday == 0:
            # Today is Monday; reference Sunday was yesterday
            current_cycle_sunday = today_date - timedelta(days=1)
        else:
            # Tuesday through Saturday; reference Sunday was earlier this week
            current_cycle_sunday = today_date - timedelta(days=(weekday - 6) % 7)

        # Check if a successful execution occurred on that reference Sunday
        sunday_executed_successfully = False
        if state.last_executed_at is not None:
            last_exec_local = state.last_executed_at.astimezone()
            if (
                last_exec_local.date() == current_cycle_sunday
                and state.last_execution_status == "SUCCESS"
            ):
                sunday_executed_successfully = True

        # Rule 1: Every Sunday execution
        if weekday == 6:
            if not sunday_executed_successfully:
                return "SUNDAY_SCHEDULED"
            return None

        # Rule 2: Next day (Monday) morning 6:00 AM fallback
        if weekday == 0:
            # Must be at or after 6:00 AM
            if now_local.hour >= 6:
                # Check if Sunday execution was NOT executed (or disabled on Sunday)
                if not sunday_executed_successfully:
                    # Check if Monday retry has ALREADY executed today
                    already_retried_today = False
                    if state.last_executed_at is not None:
                        last_exec_local = state.last_executed_at.astimezone()
                        if (
                            last_exec_local.date() == today_date
                            and state.last_execution_type == "MONDAY_6AM_RETRY"
                            and state.last_execution_status == "SUCCESS"
                        ):
                            already_retried_today = True

                    if not already_retried_today:
                        return "MONDAY_6AM_RETRY"

        return None

    @classmethod
    def check_and_run_scheduled(
        cls,
        db: Session,
        current_time: Optional[datetime] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Checks current schedule and triggers cleanup if due.
        Called on periodic background scheduler ticks.
        """
        trigger = cls.evaluate_schedule_trigger(db, current_time=current_time)
        if trigger:
            logger.info(f"[{SERVICE_NAME}] Scheduled trigger fired: {trigger}")
            return cls.scan_and_cleanup(db, trigger_type=trigger, force=False)
        return None

    @classmethod
    def calculate_next_scheduled_run(
        cls,
        state: ServiceExecutionState,
        current_time: Optional[datetime] = None
    ) -> datetime:
        """Calculates the next anticipated execution datetime."""
        now_local = current_time or datetime.now().astimezone()
        weekday = now_local.weekday()
        today = now_local.date()

        # If today is Sunday
        if weekday == 6:
            executed_today = (
                state.last_executed_at is not None
                and state.last_executed_at.astimezone().date() == today
                and state.last_execution_status == "SUCCESS"
            )
            if not executed_today:
                return now_local  # Due now
            else:
                next_sunday = today + timedelta(days=7)
                return datetime.combine(next_sunday, time(0, 0), tzinfo=now_local.tzinfo)

        # If today is Monday
        if weekday == 0:
            sunday_yesterday = today - timedelta(days=1)
            executed_on_sunday = (
                state.last_executed_at is not None
                and state.last_executed_at.astimezone().date() == sunday_yesterday
                and state.last_execution_status == "SUCCESS"
            )
            retried_today = (
                state.last_executed_at is not None
                and state.last_executed_at.astimezone().date() == today
                and state.last_execution_type == "MONDAY_6AM_RETRY"
                and state.last_execution_status == "SUCCESS"
            )
            if not executed_on_sunday and not retried_today:
                if now_local.hour < 6:
                    return datetime.combine(today, time(6, 0), tzinfo=now_local.tzinfo)
                return now_local  # Due now (Monday 6 AM retry)

        # For Tuesday through Saturday (or after Monday retry/Sunday run)
        days_until_sunday = (6 - weekday) % 7
        if days_until_sunday == 0:
            days_until_sunday = 7
        next_sunday = today + timedelta(days=days_until_sunday)
        return datetime.combine(next_sunday, time(0, 0), tzinfo=now_local.tzinfo)

    @classmethod
    def get_status(cls, db: Session) -> Dict[str, Any]:
        """Provides full real-time telemetry and status for the service."""
        state = cls.get_or_create_state(db)
        now_local = datetime.now().astimezone()
        next_run = cls.calculate_next_scheduled_run(state, now_local)

        # Count total notifications and expired notifications currently in table
        now_utc = datetime.now(timezone.utc)
        threshold_90d = now_utc - timedelta(days=DEFAULT_RETENTION_DAYS)
        total_rows = db.query(Notification).count()
        expired_rows = db.query(Notification).filter(Notification.created_at <= threshold_90d).count()

        recent_logs = db.query(ServiceExecutionLog).filter(
            ServiceExecutionLog.service_name == SERVICE_NAME
        ).order_by(ServiceExecutionLog.triggered_at.desc()).limit(5).all()

        log_history = [
            {
                "id": l.id,
                "triggered_at": l.triggered_at.isoformat() if l.triggered_at else None,
                "trigger_type": l.trigger_type,
                "status": l.status,
                "scanned_count": l.scanned_count,
                "deleted_count": l.deleted_count
            }
            for l in recent_logs
        ]

        return {
            "service_name": SERVICE_NAME,
            "table_target": "public.notifications",
            "retention_period_days": DEFAULT_RETENTION_DAYS,
            "is_enabled": state.is_enabled,
            "server_current_time": now_local.isoformat(),
            "server_day_of_week": now_local.strftime("%A"),
            "next_scheduled_run": next_run.isoformat(),
            "last_executed_at": state.last_executed_at.astimezone().isoformat() if state.last_executed_at else None,
            "last_execution_status": state.last_execution_status,
            "last_execution_type": state.last_execution_type,
            "last_deleted_count": state.last_deleted_count,
            "last_scanned_count": state.last_scanned_count,
            "last_error_message": state.last_error_message,
            "table_statistics": {
                "total_notifications_count": total_rows,
                "expired_eligible_for_deletion_count": expired_rows,
                "active_retained_count": total_rows - expired_rows,
                "threshold_timestamp": threshold_90d.isoformat()
            },
            "schedule_rules": {
                "primary": "Executes every Sunday",
                "fallback": "If service is disabled or not executed on Sunday, re-executes next day (Monday) morning at 6:00 AM",
                "retention_rule": "Deletes rows where column created_at has crossed 90 or more days"
            },
            "recent_execution_history": log_history
        }


# =====================================================================
# Background Scheduler Async Loop
# =====================================================================
async def notification_cleanup_background_scheduler(check_interval_seconds: int = 60):
    """
    Asynchronous background scheduler loop executed in FastAPI lifespan.
    Checks schedule every `check_interval_seconds` and triggers cleanup
    on Sunday and Monday 6:00 AM fallback.
    """
    import asyncio
    logger.info("[Notification Cleanup Service] Background scheduler loop started.")
    while True:
        try:
            db = SessionLocal()
            try:
                NotificationCleanupService.check_and_run_scheduled(db)
            finally:
                db.close()
        except asyncio.CancelledError:
            logger.info("[Notification Cleanup Service] Background scheduler loop cancelled.")
            break
        except Exception as e:
            logger.error(f"[Notification Cleanup Service] Scheduler loop error: {e}", exc_info=True)

        await asyncio.sleep(check_interval_seconds)


# =====================================================================
# CLI Invocation Support
# =====================================================================
if __name__ == "__main__":
    db = SessionLocal()
    try:
        args = sys.argv[1:]
        if "--run" in args or "-r" in args:
            force_flag = "--force" in args
            print(f"[CLI] Running Notification Cleanup Service (force={force_flag})...")
            res = NotificationCleanupService.scan_and_cleanup(db, trigger_type="MANUAL", force=force_flag)
            print(json.dumps(res, indent=2))
        elif "--enable" in args:
            res = NotificationCleanupService.set_service_enabled(db, True)
            print(json.dumps(res, indent=2))
        elif "--disable" in args:
            res = NotificationCleanupService.set_service_enabled(db, False)
            print(json.dumps(res, indent=2))
        elif "--check-schedule" in args:
            trigger = NotificationCleanupService.evaluate_schedule_trigger(db)
            print(f"Schedule trigger due: {trigger}")
        else:
            status_data = NotificationCleanupService.get_status(db)
            print(json.dumps(status_data, indent=2))
    finally:
        db.close()
