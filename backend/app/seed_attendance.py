from datetime import datetime, date, timedelta, time
import random
from app.core.database import SessionLocal
from app.models.domain import User, AttendanceRecord, AttendanceSetting

def seed_attendance_data():
    db = SessionLocal()
    try:
        # 1. Seed or ensure AttendanceSetting: is_saturday_working default False
        sat_setting = db.query(AttendanceSetting).filter(AttendanceSetting.setting_key == "is_saturday_working").first()
        if not sat_setting:
            sat_setting = AttendanceSetting(
                setting_key="is_saturday_working",
                setting_value="false"
            )
            db.add(sat_setting)
            db.commit()

        # Check if attendance records already exist
        existing_count = db.query(AttendanceRecord).count()
        if existing_count > 20:
            print(f"Attendance records already exist ({existing_count} records). Skipping full seed.")
            return

        users = db.query(User).all()
        if not users:
            print("No users found to seed attendance for.")
            return

        today = date.today()

        # Seed records for the past 21 days
        for day_offset in range(21, -1, -1):
            curr_date = today - timedelta(days=day_offset)
            weekday = curr_date.weekday() # 0 = Monday, 5 = Saturday, 6 = Sunday

            for user in users:
                # Check if record already exists for this user and date
                existing = db.query(AttendanceRecord).filter(
                    AttendanceRecord.user_id == user.id,
                    AttendanceRecord.date == curr_date
                ).first()
                if existing:
                    continue

                if weekday == 6:
                    # Sunday - Weekend
                    rec = AttendanceRecord(
                        user_id=user.id,
                        date=curr_date,
                        status="Weekend",
                        session_stage="not_started",
                        total_hours=0.0
                    )
                    db.add(rec)
                    continue

                if weekday == 5:
                    # Saturday - Optional Saturday
                    # Make 1 out of 3 Saturdays a working Saturday
                    is_working_sat = (day_offset % 2 == 0)
                    if is_working_sat:
                        ci_time = datetime.combine(curr_date, time(9, 30))
                        co_time = datetime.combine(curr_date, time(14, 0))
                        rec = AttendanceRecord(
                            user_id=user.id,
                            date=curr_date,
                            check_in=ci_time,
                            check_out=co_time,
                            total_hours=4.5,
                            status="Saturday Working",
                            session_stage="checked_out"
                        )
                    else:
                        rec = AttendanceRecord(
                            user_id=user.id,
                            date=curr_date,
                            status="Weekend",
                            session_stage="not_started",
                            total_hours=0.0
                        )
                    db.add(rec)
                    continue

                # Monday to Friday: Standard working day
                if curr_date < today:
                    # Past days: fully completed day
                    minute_offset = random.randint(-5, 15)
                    ci_time = datetime.combine(curr_date, time(9, 30)) + timedelta(minutes=minute_offset)
                    ls_time = datetime.combine(curr_date, time(12, 30)) + timedelta(minutes=random.randint(0, 10))
                    le_time = ls_time + timedelta(minutes=45)
                    bs_time = datetime.combine(curr_date, time(17, 15)) + timedelta(minutes=random.randint(0, 10))
                    be_time = bs_time + timedelta(minutes=20)
                    co_time = datetime.combine(curr_date, time(18, 45)) + timedelta(minutes=random.randint(0, 30))
                    
                    work_hours = round(random.uniform(8.1, 8.8), 2)
                    rec = AttendanceRecord(
                        user_id=user.id,
                        date=curr_date,
                        check_in=ci_time,
                        lunch_start=ls_time,
                        lunch_end=le_time,
                        break_start=bs_time,
                        break_end=be_time,
                        check_out=co_time,
                        total_hours=work_hours,
                        status="Present",
                        session_stage="checked_out"
                    )
                    db.add(rec)
                else:
                    # Today: Active day
                    ci_time = datetime.combine(curr_date, time(9, 30))
                    ls_time = datetime.combine(curr_date, time(12, 30))
                    le_time = datetime.combine(curr_date, time(13, 15))
                    bs_time = datetime.combine(curr_date, time(17, 15))
                    
                    # Today user is in break or checked_in stage
                    rec = AttendanceRecord(
                        user_id=user.id,
                        date=curr_date,
                        check_in=ci_time,
                        lunch_start=ls_time,
                        lunch_end=le_time,
                        break_start=bs_time,
                        total_hours=7.2,
                        status="Present",
                        session_stage="break"
                    )
                    db.add(rec)

        db.commit()
        print(f"Seeded attendance records successfully for {len(users)} users over 21 days.")
    except Exception as e:
        db.rollback()
        print(f"Error seeding attendance records: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_attendance_data()
