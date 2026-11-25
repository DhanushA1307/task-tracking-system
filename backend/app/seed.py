from datetime import date, datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.core.database import SessionLocal, engine, Base
from app.core.security import get_password_hash
from app.models.domain import User, UserProfile, Project, Task, TaskAssignment, Notification, InternRecord

def seed_database():
    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()
    try:
        print("[SEED] Seeding Task Tracking System database...")

        # Default password hash for "admin123"
        hashed_pw = get_password_hash("admin123")

        # 1. Projects
        p1 = db.query(Project).filter(Project.name == "Edutech LMS Platform").first()
        if not p1:
            p1 = Project(
                name="Edutech LMS Platform",
                description="Enterprise learning management and skill tracking platform for higher education.",
                client_name="EduTech Global",
                department="Edutech",
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
                status="In Progress",
            )
            db.add(p1)

        p2 = db.query(Project).filter(Project.name == "Ingage Task Tracking System").first()
        if not p2:
            p2 = Project(
                name="Ingage Task Tracking System",
                description="Internal hierarchy task assignment and work status tracking system.",
                client_name="Ingage Internal",
                department="Ingage",
                start_date=date(2026, 2, 1),
                end_date=date(2026, 8, 30),
                status="In Progress",
            )
            db.add(p2)

        p3 = db.query(Project).filter(Project.name == "Rezov Analytics Suite").first()
        if not p3:
            p3 = Project(
                name="Rezov Analytics Suite",
                description="Operational analytics and real-time dashboard visualization engine.",
                client_name="Rezov Inc.",
                department="Rezov",
                start_date=date(2026, 1, 15),
                end_date=date(2026, 10, 15),
                status="In Progress",
            )
            db.add(p3)

        db.flush()

        # 2. Hierarchy Users
        # Level 1: Super Admin
        super_admin = db.query(User).filter(User.email == "superadmin@ingage.com").first()
        if not super_admin:
            super_admin = User(
                email="superadmin@ingage.com",
                full_name="Elizabeth Reed",
                password_hash=hashed_pw,
                role="super_admin",
                status="Active",
                profile_status="Completed",
                current_status="On Duty",
            )
            db.add(super_admin)
            db.flush()

        sa_profile = db.query(UserProfile).filter(UserProfile.user_id == super_admin.id).first()
        if not sa_profile:
            sa_profile = UserProfile(
                user_id=super_admin.id,
                staff_category="Employee",
                employee_id="ING-EMP-2024-0001",
                designation="VP of Engineering & Technology",
                department="Ingage",
                mobile="+91 99401 23456",
                profile_photo="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&auto=format&fit=crop&q=80",
                address="Penthouse 12, Ocean View Towers, Marina Beach Road",
                city="Chennai",
                state="Tamil Nadu",
                country="India",
                skills=["Enterprise Architecture", "Cloud Systems", "Agile Strategy", "Engineering Leadership"],
                joining_date=date(2024, 1, 10),
            )
            db.add(sa_profile)

        # Level 2: Admin
        admin = db.query(User).filter(User.email == "admin@ingage.com").first()
        if not admin:
            admin = User(
                email="admin@ingage.com",
                full_name="Alex Morgan",
                password_hash=hashed_pw,
                role="admin",
                status="Active",
                profile_status="Completed",
                current_status="On Duty",
            )
            db.add(admin)
            db.flush()

        # Also support dhanusha130703@gmail.com as admin if present
        existing_admin2 = db.query(User).filter(User.email == "dhanusha130703@gmail.com").first()
        if existing_admin2:
            existing_admin2.password_hash = hashed_pw
            existing_admin2.role = "admin"
            existing_admin2.full_name = existing_admin2.full_name or "Dhanush Admin"
            existing_admin2.current_status = "On Duty"
            if not existing_admin2.profile:
                p_adm = UserProfile(
                    user_id=existing_admin2.id,
                    staff_category="Employee",
                    employee_id="ING-EMP-2025-0010",
                    designation="Engineering Admin",
                    department="Edutech",
                    reporting_manager_id=super_admin.id,
                    mobile="+91 98402 34567",
                    address="Tower B, Prestige Bella Vista, Porur",
                    city="Chennai",
                    state="Tamil Nadu",
                    country="India",
                    skills=["FastAPI", "PostgreSQL", "System Administration", "DevOps"],
                    joining_date=date(2025, 3, 1),
                )
                db.add(p_adm)

        admin_profile = db.query(UserProfile).filter(UserProfile.user_id == admin.id).first()
        if not admin_profile:
            admin_profile = UserProfile(
                user_id=admin.id,
                staff_category="Employee",
                employee_id="ING-EMP-2025-0012",
                designation="Engineering Director",
                department="Edutech",
                reporting_manager_id=super_admin.id,
                mobile="+91 98402 11223",
                profile_photo="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80",
                address="Villa 4, Green Meadows, OMR Expressway, Perungudi",
                city="Chennai",
                state="Tamil Nadu",
                country="India",
                skills=["System Design", "PostgreSQL", "DevOps", "Agile Management", "Data Architecture"],
                joining_date=date(2025, 2, 1),
            )
            db.add(admin_profile)

        # Level 3: Team Lead
        team_lead = db.query(User).filter(User.email == "teamlead@ingage.com").first()
        if not team_lead:
            team_lead = User(
                email="teamlead@ingage.com",
                full_name="Sarah Jenkins",
                password_hash=hashed_pw,
                role="team_lead",
                status="Active",
                profile_status="Completed",
                current_status="On Duty",
            )
            db.add(team_lead)
            db.flush()

        tl_profile = db.query(UserProfile).filter(UserProfile.user_id == team_lead.id).first()
        if not tl_profile:
            tl_profile = UserProfile(
                user_id=team_lead.id,
                staff_category="Employee",
                employee_id="ING-EMP-2025-0045",
                designation="Senior Technical Lead",
                department="Edutech",
                reporting_manager_id=admin.id,
                mobile="+91 97910 98765",
                profile_photo="https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&auto=format&fit=crop&q=80",
                address="Flat 302, Skyline Residency, Velachery Main Road",
                city="Chennai",
                state="Tamil Nadu",
                country="India",
                skills=["ReactJS", "FastAPI", "CQRS Architecture", "Team Mentorship", "Code Review"],
                joining_date=date(2025, 6, 15),
            )
            db.add(tl_profile)

        # Level 4: Intern
        # Check existing drickcurve123@gmail.com or intern@ingage.com
        intern_user = db.query(User).filter(User.email == "drickcurve123@gmail.com").first()
        if not intern_user:
            intern_user = db.query(User).filter(User.email == "intern@ingage.com").first()
        if not intern_user:
            intern_user = User(
                email="drickcurve123@gmail.com",
                full_name="Dhanush A",
                password_hash=hashed_pw,
                role="intern",
                status="Active",
                profile_status="Completed",
                current_status="On Duty",
            )
            db.add(intern_user)
            db.flush()
        else:
            intern_user.password_hash = hashed_pw
            intern_user.full_name = intern_user.full_name or "Dhanush A"
            intern_user.current_status = "On Duty"

        intern_profile = db.query(UserProfile).filter(UserProfile.user_id == intern_user.id).first()
        if not intern_profile:
            intern_profile = UserProfile(
                user_id=intern_user.id,
                staff_category="Intern",
                intern_id="ING-INT-2026-0002",
                designation="Frontend Developer Intern",
                department="Edutech",
                reporting_manager_id=team_lead.id,
                mobile="+91 98765 43210",
                profile_photo="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=400&auto=format&fit=crop&q=80",
                address="No. 42, Silicon Valley Avenue, T. Nagar",
                city="Chennai",
                state="Tamil Nadu",
                country="India",
                skills=["ReactJS", "FastAPI", "PostgreSQL", "CQRS", "Tailwind CSS", "JavaScript", "Python"],
                joining_date=date(2026, 1, 15),
            )
            db.add(intern_profile)
        else:
            intern_profile.staff_category = "Intern"
            intern_profile.intern_id = intern_profile.intern_id or "ING-INT-2026-0002"
            intern_profile.designation = intern_profile.designation or "Frontend Developer Intern"
            intern_profile.department = intern_profile.department or "Edutech"
            intern_profile.reporting_manager_id = team_lead.id
            intern_profile.mobile = intern_profile.mobile or "+91 98765 43210"
            intern_profile.address = intern_profile.address or "No. 42, Silicon Valley Avenue, T. Nagar"
            intern_profile.city = intern_profile.city or "Chennai"
            intern_profile.state = intern_profile.state or "Tamil Nadu"
            intern_profile.country = intern_profile.country or "India"
            intern_profile.skills = ["ReactJS", "FastAPI", "PostgreSQL", "CQRS", "Tailwind CSS", "JavaScript", "Python"]
            intern_profile.profile_photo = intern_profile.profile_photo or "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=400&auto=format&fit=crop&q=80"
            intern_profile.joining_date = intern_profile.joining_date or date(2026, 1, 15)

        # Peer Intern (Priya)
        peer_intern = db.query(User).filter(User.email == "priya.sharma@ingage.com").first()
        if not peer_intern:
            peer_intern = User(
                email="priya.sharma@ingage.com",
                full_name="Priya Sharma",
                password_hash=hashed_pw,
                role="intern",
                status="Active",
                profile_status="Completed",
                current_status="On Duty",
            )
            db.add(peer_intern)
            db.flush()
            p_prof = UserProfile(
                user_id=peer_intern.id,
                staff_category="Intern",
                intern_id="ING-INT-2026-0005",
                designation="Full Stack Developer Intern",
                department="Edutech",
                reporting_manager_id=team_lead.id,
                mobile="+91 98112 34567",
                profile_photo="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&auto=format&fit=crop&q=80",
                address="Flat 104, Green Park Residences, Anna Nagar",
                city="Chennai",
                state="Tamil Nadu",
                country="India",
                skills=["ReactJS", "Node.js", "Python", "SQL", "Tailwind CSS"],
                joining_date=date(2026, 2, 1),
            )
            db.add(p_prof)
        else:
            peer_intern.password_hash = hashed_pw
            peer_intern.role = "intern"

        # Intern (Karthik Subramanian)
        karthik_intern = db.query(User).filter(User.email == "karthik.s@ingage.com").first()
        if not karthik_intern:
            karthik_intern = User(
                email="karthik.s@ingage.com",
                full_name="Karthik Subramanian",
                password_hash=hashed_pw,
                role="intern",
                status="Active",
                profile_status="Completed",
                current_status="On Duty",
            )
            db.add(karthik_intern)
            db.flush()
            k_prof = UserProfile(
                user_id=karthik_intern.id,
                staff_category="Intern",
                intern_id="ING-INT-2026-0006",
                designation="Backend Developer Intern",
                department="Edutech",
                reporting_manager_id=team_lead.id,
                mobile="+91 97890 12345",
                address="Plot 18, Royal Enclave, Thiruvanmiyur",
                city="Chennai",
                state="Tamil Nadu",
                country="India",
                skills=["Python", "FastAPI", "PostgreSQL", "Docker"],
                joining_date=date(2026, 2, 1),
            )
            db.add(k_prof)
        else:
            karthik_intern.password_hash = hashed_pw
            karthik_intern.role = "intern"

        # Intern (Ananya Rao)
        ananya_intern = db.query(User).filter(User.email == "ananya.rao@ingage.com").first()
        if not ananya_intern:
            ananya_intern = User(
                email="ananya.rao@ingage.com",
                full_name="Ananya Rao",
                password_hash=hashed_pw,
                role="intern",
                status="Active",
                profile_status="Completed",
                current_status="On Duty",
            )
            db.add(ananya_intern)
            db.flush()
            a_prof = UserProfile(
                user_id=ananya_intern.id,
                staff_category="Intern",
                intern_id="ING-INT-2026-0007",
                designation="Frontend Developer Intern",
                department="Edutech",
                reporting_manager_id=team_lead.id,
                mobile="+91 96543 21098",
                address="Villa 12, Sobha Lakeview, Bellandur",
                city="Bengaluru",
                state="Karnataka",
                country="India",
                skills=["ReactJS", "UI/UX", "Tailwind CSS", "JavaScript"],
                joining_date=date(2026, 2, 1),
            )
            db.add(a_prof)
        else:
            ananya_intern.password_hash = hashed_pw
            ananya_intern.role = "intern"

        # Human Resource Manager (HR)
        hr_user = db.query(User).filter(User.email == "hr@ingage.com").first()
        if not hr_user:
            hr_user = User(
                email="hr@ingage.com",
                full_name="Meera Raman",
                password_hash=hashed_pw,
                role="hr",
                status="Active",
                profile_status="Completed",
                current_status="On Duty",
            )
            db.add(hr_user)
            db.flush()
        else:
            hr_user.password_hash = hashed_pw
            hr_user.role = "hr"
            hr_user.full_name = hr_user.full_name or "Meera Raman"
            hr_user.current_status = "On Duty"

        hr_profile = db.query(UserProfile).filter(UserProfile.user_id == hr_user.id).first()
        if not hr_profile:
            hr_profile = UserProfile(
                user_id=hr_user.id,
                staff_category="Employee",
                employee_id="ING-HR-2025-0008",
                designation="Human Resource Manager",
                department="Ingage",
                reporting_manager_id=super_admin.id,
                mobile="+91 98401 55678",
                profile_photo="https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=400&auto=format&fit=crop&q=80",
                address="No. 15, Cenotaph Road, Teynampet",
                city="Chennai",
                state="Tamil Nadu",
                country="India",
                skills=["Talent Acquisition", "Employee Onboarding", "Performance Management", "HR Compliance", "Intern Records Management"],
                joining_date=date(2025, 1, 15),
            )
            db.add(hr_profile)
        else:
            hr_profile.designation = "Human Resource Manager"
            hr_profile.department = "Ingage"
            hr_profile.reporting_manager_id = super_admin.id

        db.commit()

        # Seed Intern Records under Human Resource Manager
        existing_records = db.query(InternRecord).count()
        if existing_records == 0:
            sample_records = [
                InternRecord(
                    full_name="Priya Sharma",
                    mobile_number="+91 98112 34567",
                    emergency_number="+91 94440 88991",
                    residential_address="Flat 104, Green Park Residences, Anna Nagar, Chennai - 600040",
                    home_address="Flat 104, Green Park Residences, Anna Nagar, Chennai - 600040",
                    is_home_same_as_residential=True,
                    tenth_marksheet="10th_Marksheet_Priya_Sharma_93pct.pdf",
                    twelfth_marksheet="12th_Marksheet_Priya_Sharma_HSC_91pct.pdf",
                    college_marksheet="College_Consolidated_Marksheet_Priya_8.8CGPA.pdf",
                    college_name="College of Engineering, Guindy (Anna University)",
                    year_of_start=2021,
                    year_of_end=2025,
                    created_by_id=hr_user.id,
                ),
                InternRecord(
                    full_name="Dhanush A",
                    mobile_number="+91 98765 43210",
                    emergency_number="+91 98409 11223",
                    residential_address="No. 42, Silicon Valley Avenue, T. Nagar, Chennai - 600017",
                    home_address="No. 42, Silicon Valley Avenue, T. Nagar, Chennai - 600017",
                    is_home_same_as_residential=True,
                    tenth_marksheet="10th_Marksheet_Dhanush_A_CBSE_94pct.pdf",
                    twelfth_marksheet="12th_Diploma_Marksheet_Dhanush_A_92pct.pdf",
                    college_marksheet="College_Consolidated_Marksheet_Dhanush_A_8.9CGPA.pdf",
                    college_name="Madras Institute of Technology (MIT Chromepet)",
                    year_of_start=2022,
                    year_of_end=2026,
                    created_by_id=hr_user.id,
                ),
                InternRecord(
                    full_name="Karthik Subramanian",
                    mobile_number="+91 97890 12345",
                    emergency_number="+91 99620 45678",
                    residential_address="Plot 18, Royal Enclave, Thiruvanmiyur, Chennai - 600041",
                    home_address="No. 7, Temple View Road, Madurai - 625001",
                    is_home_same_as_residential=False,
                    tenth_marksheet="10th_Marksheet_Karthik_S_ICSE_89pct.pdf",
                    twelfth_marksheet="12th_Marksheet_Karthik_S_StateBoard_90pct.pdf",
                    college_marksheet="College_Consolidated_Marksheet_Karthik_8.4CGPA.pdf",
                    college_name="SSN College of Engineering, Chennai",
                    year_of_start=2021,
                    year_of_end=2025,
                    created_by_id=hr_user.id,
                ),
                InternRecord(
                    full_name="Ananya Rao",
                    mobile_number="+91 96543 21098",
                    emergency_number="+91 97112 67890",
                    residential_address="Villa 12, Sobha Lakeview, Bellandur, Bengaluru - 560103",
                    home_address="Villa 12, Sobha Lakeview, Bellandur, Bengaluru - 560103",
                    is_home_same_as_residential=True,
                    tenth_marksheet="10th_Marksheet_Ananya_Rao_96pct.pdf",
                    twelfth_marksheet="12th_Marksheet_Ananya_Rao_94pct.pdf",
                    college_marksheet="College_Consolidated_Marksheet_Ananya_9.1CGPA.pdf",
                    college_name="National Institute of Technology (NIT Trichy)",
                    year_of_start=2021,
                    year_of_end=2025,
                    created_by_id=hr_user.id,
                ),
            ]
            for r in sample_records:
                db.add(r)
            db.commit()
            print(f"[SUCCESS] Seeded {len(sample_records)} intern records under Human Resource Manager!")

        db.commit()

        # 3. Tasks specifically for Intern Designation
        today = date.today()
        existing_tasks = db.query(Task).count()

        if existing_tasks == 0:
            tasks_data = [
                # Completed Tasks
                {
                    "title": "Implement Company Logo & Responsive Top Navbar",
                    "description": "Create the main page top navigation bar with company logo on the far left edge, notifications on last 2nd right, and profile on far right.",
                    "status": "Completed",
                    "priority": "High",
                    "progress": 100,
                    "estimated_hours": 6.0,
                    "due_date": today - timedelta(days=2),
                    "start_date": today - timedelta(days=5),
                    "project_id": p1.id,
                    "assigned_by_id": team_lead.id,
                    "submission_notes": "Implemented with sticky header, SVG logo, badge counters and responsive layout.",
                    "assignees": [intern_user.id]
                },
                {
                    "title": "Database Schema Verification and CQRS Models",
                    "description": "Map PostgreSQL tables for User, Profile, Tasks and integrate CQRS Command and Query handlers in FastAPI.",
                    "status": "Completed",
                    "priority": "High",
                    "progress": 100,
                    "estimated_hours": 8.0,
                    "due_date": today - timedelta(days=1),
                    "start_date": today - timedelta(days=4),
                    "project_id": p2.id,
                    "assigned_by_id": team_lead.id,
                    "submission_notes": "All domain tables verified and tested against PostgreSQL 18.",
                    "assignees": [intern_user.id]
                },
                {
                    "title": "Design Split-Screen Two-Context Login Page",
                    "description": "Build two-sided login page with Email/Password form on Side 1 and SSO one-click button on Side 2.",
                    "status": "Completed",
                    "priority": "Medium",
                    "progress": 100,
                    "estimated_hours": 5.0,
                    "due_date": today - timedelta(days=3),
                    "start_date": today - timedelta(days=6),
                    "project_id": p2.id,
                    "assigned_by_id": team_lead.id,
                    "submission_notes": "Split layout created with brand green theme and role switcher.",
                    "assignees": [intern_user.id]
                },

                # In Progress Tasks
                {
                    "title": "Build Kanban Board & Tabular View for My Tasks",
                    "description": "Provide view mode toggle between Board mode (Kanban columns: Backlog, In Progress, Under Review, Completed, Overdue) and Tabular mode with pagination.",
                    "status": "In Progress",
                    "priority": "High",
                    "progress": 70,
                    "estimated_hours": 12.0,
                    "due_date": today + timedelta(days=3),
                    "start_date": today - timedelta(days=2),
                    "project_id": p1.id,
                    "assigned_by_id": team_lead.id,
                    "submission_notes": "Board columns rendered, working on drag/drop and tabular pagination.",
                    "assignees": [intern_user.id]
                },
                {
                    "title": "Settings Profile Page with 7 Mandatory Attributes",
                    "description": "Show Photo, Full Name, mail-Id Address, Employee Designation Number, Employee Designation Name, Skill set, and Full Home Address.",
                    "status": "In Progress",
                    "priority": "Medium",
                    "progress": 55,
                    "estimated_hours": 6.0,
                    "due_date": today + timedelta(days=5),
                    "start_date": today - timedelta(days=1),
                    "project_id": p2.id,
                    "assigned_by_id": team_lead.id,
                    "submission_notes": "Profile cards and edit modal designed.",
                    "assignees": [intern_user.id]
                },

                # Overdue Tasks
                {
                    "title": "Legacy Authentication API Deprecation",
                    "description": "Audit old session endpoints and deprecate fallback tokens in favor of JWT Bearer tokens.",
                    "status": "Overdue",
                    "priority": "Critical",
                    "progress": 30,
                    "estimated_hours": 4.0,
                    "due_date": today - timedelta(days=2),
                    "start_date": today - timedelta(days=7),
                    "project_id": p2.id,
                    "assigned_by_id": admin.id,
                    "submission_notes": "Blocked by token refresh edge cases.",
                    "assignees": [intern_user.id]
                },
                {
                    "title": "Cross-Browser CSS Regression and Color Consistency Check",
                    "description": "Audit brand green (#65a30d) contrast and text rendering across Firefox, Chrome and Safari.",
                    "status": "Overdue",
                    "priority": "Medium",
                    "progress": 25,
                    "estimated_hours": 3.0,
                    "due_date": today - timedelta(days=4),
                    "start_date": today - timedelta(days=8),
                    "project_id": p1.id,
                    "assigned_by_id": team_lead.id,
                    "submission_notes": "Found subtle gamma difference on older Firefox versions.",
                    "assignees": [intern_user.id]
                },

                # Under Review Tasks
                {
                    "title": "Predecessor / Successor Hierarchy Tree View",
                    "description": "Render interactive hierarchy chain for Interns showing higher designation person (Team Lead, Admin, Super Admin).",
                    "status": "Under Review",
                    "priority": "High",
                    "progress": 90,
                    "estimated_hours": 7.0,
                    "due_date": today + timedelta(days=2),
                    "start_date": today - timedelta(days=3),
                    "project_id": p1.id,
                    "assigned_by_id": team_lead.id,
                    "submission_notes": "PR submitted for review with team lead.",
                    "assignees": [intern_user.id]
                },

                # Backlog Tasks
                {
                    "title": "WebSocket Push for Real-Time Task Notifications",
                    "description": "Implement live notification banner when managers reassign or change task statuses.",
                    "status": "Backlog",
                    "priority": "Low",
                    "progress": 0,
                    "estimated_hours": 10.0,
                    "due_date": today + timedelta(days=14),
                    "start_date": today + timedelta(days=7),
                    "project_id": p3.id,
                    "assigned_by_id": team_lead.id,
                    "submission_notes": "Requirements gathered.",
                    "assignees": [intern_user.id, peer_intern.id]
                },
            ]

            for td in tasks_data:
                assignees = td.pop("assignees")
                task = Task(**td, assignment_type="individual" if len(assignees) == 1 else "team")
                db.add(task)
                db.flush()

                for uid in assignees:
                    db.add(TaskAssignment(task_id=task.id, user_id=uid))

            # Add Notifications for Intern
            notifs = [
                Notification(
                    user_id=intern_user.id,
                    title="Task Overdue Notice",
                    message="Task 'Legacy Authentication API Deprecation' has exceeded its due date. Please update the status.",
                    notification_type="task_alert",
                    is_read=False,
                ),
                Notification(
                    user_id=intern_user.id,
                    title="Code Review Requested",
                    message="Sarah Jenkins reviewed 'Implement Company Logo & Responsive Top Navbar'. Changes approved!",
                    notification_type="review",
                    is_read=False,
                ),
                Notification(
                    user_id=intern_user.id,
                    title="New Assignment",
                    message="You have been assigned to 'Predecessor / Successor Hierarchy Tree View'.",
                    notification_type="assignment",
                    is_read=True,
                )
            ]
            for n in notifs:
                db.add(n)

            db.commit()
            print(f"[SUCCESS] Successfully seeded {len(tasks_data)} tasks and notifications!")
        else:
            print(f"[INFO] Database already has {existing_tasks} tasks. Seed completed.")

    except Exception as e:
        db.rollback()
        print(f"[ERROR] Error during seed: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    seed_database()
