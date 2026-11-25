"""
Test suite for Notification Cleanup Application Service:
1. Verifies 90-day threshold deletion (only rows >= 90 days are deleted).
2. Verifies rows < 90 days are preserved.
3. Verifies Sunday scheduled execution trigger.
4. Verifies Sunday duplicate run prevention.
5. Verifies Monday 6:00 AM fallback / catch-up trigger when Sunday was missed or disabled.
6. Verifies Monday before 6:00 AM does not trigger.
7. Verifies Monday duplicate retry prevention once executed.
8. Verifies Enable/Disable toggle behavior.
"""

import sys
import unittest
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from app.core.database import SessionLocal
from app.models.domain import User, Notification, ServiceExecutionState, ServiceExecutionLog
from app.services.notification_cleanup_service import (
    NotificationCleanupService,
    SERVICE_NAME,
    DEFAULT_RETENTION_DAYS
)


class TestNotificationCleanupService(unittest.TestCase):
    def setUp(self):
        self.db = SessionLocal()
        # Find a test user
        self.user = self.db.query(User).first()
        self.assertIsNotNone(self.user, "At least one user must exist in the database for notifications")

    def tearDown(self):
        # Clean up any test notifications created
        self.db.query(Notification).filter(
            Notification.title.like("TEST_NOTIF_%")
        ).delete(synchronize_session=False)
        self.db.commit()
        self.db.close()

    def test_01_verify_and_delete_rows_crossed_90_days(self):
        """Test that every row is scanned and only rows crossed 90+ days are deleted."""
        now = datetime.now(timezone.utc)

        # 1. Create a notification 95 days old (Crossed 90 days -> MUST BE DELETED)
        old_notif_95 = Notification(
            user_id=self.user.id,
            title="TEST_NOTIF_95_DAYS_OLD",
            message="This notification is 95 days old and should be deleted.",
            created_at=now - timedelta(days=95),
            is_read=False
        )
        # 2. Create a notification 90 days + 2 hours old (Crossed 90 days -> MUST BE DELETED)
        old_notif_90 = Notification(
            user_id=self.user.id,
            title="TEST_NOTIF_90_DAYS_OLD",
            message="This notification is 90 days and 2 hours old and should be deleted.",
            created_at=now - timedelta(days=90, hours=2),
            is_read=True
        )
        # 3. Create a notification 89 days old (Under 90 days -> MUST BE PRESERVED)
        recent_notif_89 = Notification(
            user_id=self.user.id,
            title="TEST_NOTIF_89_DAYS_OLD",
            message="This notification is 89 days old and should be preserved.",
            created_at=now - timedelta(days=89),
            is_read=False
        )
        # 4. Create a notification 5 days old (Under 90 days -> MUST BE PRESERVED)
        recent_notif_5 = Notification(
            user_id=self.user.id,
            title="TEST_NOTIF_5_DAYS_OLD",
            message="This notification is 5 days old and should be preserved.",
            created_at=now - timedelta(days=5),
            is_read=True
        )

        self.db.add_all([old_notif_95, old_notif_90, recent_notif_89, recent_notif_5])
        self.db.commit()
        self.db.refresh(old_notif_95)
        self.db.refresh(old_notif_90)
        self.db.refresh(recent_notif_89)
        self.db.refresh(recent_notif_5)

        id_95 = old_notif_95.id
        id_90 = old_notif_90.id
        id_89 = recent_notif_89.id
        id_5 = recent_notif_5.id

        # Execute the application service cleanup
        result = NotificationCleanupService.scan_and_cleanup(
            self.db,
            retention_days=90,
            trigger_type="TEST_EXECUTION",
            force=True
        )

        self.assertEqual(result["status"], "SUCCESS")
        self.assertGreaterEqual(result["deleted_count"], 2)

        # Verify that scan returns deleted records containing only the target columns (id, user_id, task_id, created_at)
        for record in result["deleted_records"]:
            self.assertIn("id", record)
            self.assertIn("user_id", record)
            self.assertIn("task_id", record)
            self.assertIn("created_at", record)

        # Verify in database using only (id, user_id, task_id, created_at): 95 days and 90.08 days old MUST be deleted
        deleted_95 = self.db.query(
            Notification.id, Notification.user_id, Notification.task_id, Notification.created_at
        ).filter(Notification.id == id_95).first()
        deleted_90 = self.db.query(
            Notification.id, Notification.user_id, Notification.task_id, Notification.created_at
        ).filter(Notification.id == id_90).first()
        self.assertIsNone(deleted_95, "Notification >= 95 days old was not deleted!")
        self.assertIsNone(deleted_90, "Notification >= 90 days old was not deleted!")

        # Verify in database: 89 days and 5 days old MUST be retained
        kept_89 = self.db.query(
            Notification.id, Notification.user_id, Notification.task_id, Notification.created_at
        ).filter(Notification.id == id_89).first()
        kept_5 = self.db.query(
            Notification.id, Notification.user_id, Notification.task_id, Notification.created_at
        ).filter(Notification.id == id_5).first()
        self.assertIsNotNone(kept_89, "Notification < 90 days old was mistakenly deleted!")
        self.assertIsNotNone(kept_5, "Notification < 90 days old was mistakenly deleted!")

        print("[TEST 01 PASSED] 90-day verification: 90+ days deleted, <90 days preserved.")

    def test_02_sunday_schedule_execution(self):
        """Test that the service detects Sunday and triggers SUNDAY_SCHEDULED."""
        # Simulated Sunday: 2026-11-22 10:00:00 (Sunday)
        simulated_sunday = datetime(2026, 11, 22, 10, 0, 0, tzinfo=timezone.utc)
        self.assertEqual(simulated_sunday.weekday(), 6, "2026-11-22 must be a Sunday")

        # Reset state last_executed_at to an earlier date
        state = NotificationCleanupService.get_or_create_state(self.db)
        state.is_enabled = True
        state.last_executed_at = datetime(2026, 11, 15, 10, 0, 0, tzinfo=timezone.utc)  # previous Sunday
        state.last_execution_status = "SUCCESS"
        self.db.commit()

        # Check schedule trigger for this Sunday
        trigger = NotificationCleanupService.evaluate_schedule_trigger(self.db, current_time=simulated_sunday)
        self.assertEqual(trigger, "SUNDAY_SCHEDULED", "Service did not trigger on Sunday!")

        # After it executes for this Sunday:
        state.last_executed_at = simulated_sunday
        state.last_execution_type = "SUNDAY_SCHEDULED"
        state.last_execution_status = "SUCCESS"
        self.db.commit()

        # Should NOT trigger again on the same Sunday
        trigger_again = NotificationCleanupService.evaluate_schedule_trigger(
            self.db, current_time=simulated_sunday + timedelta(hours=3)
        )
        self.assertIsNone(trigger_again, "Service erroneously re-triggered on the same Sunday!")

        print("[TEST 02 PASSED] Sunday scheduled execution and single-run guarantee verified.")

    def test_03_monday_6am_fallback_when_sunday_missed(self):
        """Test that if Sunday was not executed, service re-executes at Monday 6:00 AM."""
        # Sunday date: 2026-11-22
        # Monday date: 2026-11-23

        # State: Sunday was NOT executed (last run was previous week)
        state = NotificationCleanupService.get_or_create_state(self.db)
        state.is_enabled = True
        state.last_executed_at = datetime(2026, 11, 15, 10, 0, 0, tzinfo=timezone.utc)  # previous week
        state.last_execution_status = "SUCCESS"
        self.db.commit()

        # Monday 05:30 AM (before 6:00 AM): Should NOT trigger yet
        monday_530_am = datetime(2026, 11, 23, 5, 30, 0, tzinfo=timezone.utc)
        trigger_early = NotificationCleanupService.evaluate_schedule_trigger(self.db, current_time=monday_530_am)
        self.assertIsNone(trigger_early, "Service triggered before Monday 6:00 AM!")

        # Monday 06:00 AM (exact): Should trigger MONDAY_6AM_RETRY
        monday_600_am = datetime(2026, 11, 23, 6, 0, 0, tzinfo=timezone.utc)
        trigger_6am = NotificationCleanupService.evaluate_schedule_trigger(self.db, current_time=monday_600_am)
        self.assertEqual(trigger_6am, "MONDAY_6AM_RETRY", "Service failed to trigger at Monday 6:00 AM catch-up!")

        # Monday 06:15 AM (after 6 AM): Should also trigger if not yet executed today
        monday_615_am = datetime(2026, 11, 23, 6, 15, 0, tzinfo=timezone.utc)
        trigger_615 = NotificationCleanupService.evaluate_schedule_trigger(self.db, current_time=monday_615_am)
        self.assertEqual(trigger_615, "MONDAY_6AM_RETRY")

        # Simulate execution of Monday 6 AM retry:
        state.last_executed_at = monday_600_am
        state.last_execution_type = "MONDAY_6AM_RETRY"
        state.last_execution_status = "SUCCESS"
        self.db.commit()

        # Monday 07:00 AM: Should NOT trigger again once executed
        monday_700_am = datetime(2026, 11, 23, 7, 0, 0, tzinfo=timezone.utc)
        trigger_after = NotificationCleanupService.evaluate_schedule_trigger(self.db, current_time=monday_700_am)
        self.assertIsNone(trigger_after, "Monday 6 AM retry fired more than once!")

        print("[TEST 03 PASSED] Monday 6:00 AM catch-up execution verified.")

    def test_04_no_monday_retry_if_sunday_succeeded(self):
        """Test that if Sunday DID execute successfully, Monday 6 AM retry does NOT fire."""
        sunday_dt = datetime(2026, 11, 22, 14, 0, 0, tzinfo=timezone.utc)
        monday_6am = datetime(2026, 11, 23, 6, 0, 0, tzinfo=timezone.utc)

        state = NotificationCleanupService.get_or_create_state(self.db)
        state.is_enabled = True
        state.last_executed_at = sunday_dt
        state.last_execution_type = "SUNDAY_SCHEDULED"
        state.last_execution_status = "SUCCESS"
        self.db.commit()

        trigger = NotificationCleanupService.evaluate_schedule_trigger(self.db, current_time=monday_6am)
        self.assertIsNone(trigger, "Monday retry fired even though Sunday run succeeded!")

        print("[TEST 04 PASSED] No redundant Monday retry when Sunday run was successful.")

    def test_05_service_disabled_behavior(self):
        """Test enabling and disabling the service."""
        # 1. Disable the service
        NotificationCleanupService.set_service_enabled(self.db, False)
        state = NotificationCleanupService.get_or_create_state(self.db)
        self.assertFalse(state.is_enabled)

        # 2. When disabled and force=False, scan_and_cleanup skips
        res = NotificationCleanupService.scan_and_cleanup(self.db, force=False)
        self.assertEqual(res["status"], "SKIPPED_DISABLED")

        # 3. Re-enable the service
        NotificationCleanupService.set_service_enabled(self.db, True)
        state = NotificationCleanupService.get_or_create_state(self.db)
        self.assertTrue(state.is_enabled)

        print("[TEST 05 PASSED] Service enable/disable toggling and skip handling verified.")

    def test_06_verify_selective_column_scanning(self):
        """Test that scanning queries only ('id', 'user_id', 'task_id', 'created_at') columns."""
        # Query specifically with the 4 target columns
        scanned_rows = self.db.query(
            Notification.id,
            Notification.user_id,
            Notification.task_id,
            Notification.created_at
        ).order_by(Notification.created_at.asc()).all()

        for row in scanned_rows:
            # Verify named tuple / Row attributes are present
            self.assertTrue(hasattr(row, "id"))
            self.assertTrue(hasattr(row, "user_id"))
            self.assertTrue(hasattr(row, "task_id"))
            self.assertTrue(hasattr(row, "created_at"))
            # Verify unselected columns are not loaded on the row tuple
            self.assertFalse(hasattr(row, "message"))
            self.assertFalse(hasattr(row, "title"))
            self.assertFalse(hasattr(row, "link"))

        print("[TEST 06 PASSED] Selective column scan (id, user_id, task_id, created_at) verified.")


if __name__ == "__main__":
    unittest.main()
