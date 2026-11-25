from datetime import datetime, timezone, date
from typing import Dict, Any, List
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.domain import User, UserProfile, Task, TaskAssignment, Notification, Project
from app.core.security import verify_password, create_access_token, get_password_hash
from app.cqrs.commands.user_commands import (
    LoginCommand, SSOLoginCommand, UpdateUserProfileCommand, CreateUserCommand,
    BulkCreateUsersCommand, ChangeOwnPasswordCommand, ResetUserPasswordCommand,
)
from app.cqrs.commands.task_commands import (
    CreateTaskCommand, UpdateTaskStatusCommand, UpdateTaskDetailsCommand, DeleteTaskCommand
)
from app.cqrs.commands.notification_commands import (
    MarkNotificationReadCommand, MarkAllNotificationsReadCommand, CreateNotificationCommand,
    CleanupExpiredNotificationsCommand, ToggleNotificationServiceCommand
)

class CommandHandlers:
    @staticmethod
    def handle_login(cmd: LoginCommand, db: Session) -> Dict[str, Any]:
        user = db.query(User).filter(func.lower(User.email) == func.lower(cmd.email.strip())).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
            )
        
        if not verify_password(cmd.password, user.password_hash or ""):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
            )
        
        user.last_login_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(user)

        profile = user.profile
        token = create_access_token(subject=user.id)
        
        emp_number = (profile.intern_id if profile and profile.intern_id else (profile.employee_id if profile else f"ING-{user.id:04d}"))
        desig_name = profile.designation if profile and profile.designation else user.role.replace("_", " ").title()
        
        from app.cqrs.queries.user_queries import GetUserProfileQuery
        from app.cqrs.handlers.query_handlers import QueryHandlers
        prof_data = QueryHandlers.handle_get_user_profile(GetUserProfileQuery(user_id=user.id), db) or {}

        return {
            "access_token": token,
            "token_type": "bearer",
            "user": {
                "id": user.id,
                "email": user.email,
                "full_name": user.full_name or "User",
                "role": user.role,
                "designation": desig_name,
                "employee_number": emp_number,
                "avatar": profile.profile_photo if profile else None,
                "department": profile.department if profile else "Edutech",
                "current_status": user.current_status or "On Duty",
                "must_change_password": bool(user.must_change_password),
                "employee_count": prof_data.get("employee_count"),
                "successor_account_available": prof_data.get("successor_account_available"),
                "manager_name": prof_data.get("reporting_manager_name"),
                "manager_successor_available": prof_data.get("manager_successor_available"),
            }
        }

    @staticmethod
    def handle_sso_login(cmd: SSOLoginCommand, db: Session) -> Dict[str, Any]:
        target = cmd.role_or_email.strip().lower()
        
        # Check if role shorthand was passed
        role_map = {
            "intern": "intern",
            "team_lead": "team_lead",
            "team lead": "team_lead",
            "teamlead": "team_lead",
            "team_leader": "team_lead",
            "teamleader": "team_lead",
            "admin": "admin",
            "super_admin": "super_admin",
            "super admin": "super_admin",
            "superadmin": "super_admin",
            "hr": "hr",
            "human_resource_manager": "hr",
            "human resource manager": "hr",
            "human_resource": "hr",
            "humanresource": "hr",
            "employee": "employee",
            "staff": "employee",
        }
        
        user = None
        if target in role_map:
            role_key = role_map[target]
            user = db.query(User).filter(User.role == role_key).first()
        
        if not user:
            user = db.query(User).filter(func.lower(User.email) == target).first()
            
        if not user:
            # Fallback to any intern or first user
            user = db.query(User).filter(User.role == "intern").first() or db.query(User).first()
            
        if not user:
            raise HTTPException(status_code=404, detail="No designated user found for SSO login")
            
        user.last_login_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(user)

        profile = user.profile
        token = create_access_token(subject=user.id)
        
        emp_number = (profile.intern_id if profile and profile.intern_id else (profile.employee_id if profile else f"ING-{user.id:04d}"))
        desig_name = profile.designation if profile and profile.designation else user.role.replace("_", " ").title()

        from app.cqrs.queries.user_queries import GetUserProfileQuery
        from app.cqrs.handlers.query_handlers import QueryHandlers
        prof_data = QueryHandlers.handle_get_user_profile(GetUserProfileQuery(user_id=user.id), db) or {}

        return {
            "access_token": token,
            "token_type": "bearer",
            "user": {
                "id": user.id,
                "email": user.email,
                "full_name": user.full_name or "User",
                "role": user.role,
                "designation": desig_name,
                "employee_number": emp_number,
                "avatar": profile.profile_photo if profile else None,
                "department": profile.department if profile else "Edutech",
                "current_status": user.current_status or "On Duty",
                "must_change_password": bool(user.must_change_password),
                "employee_count": prof_data.get("employee_count"),
                "successor_account_available": prof_data.get("successor_account_available"),
                "manager_name": prof_data.get("reporting_manager_name"),
                "manager_successor_available": prof_data.get("manager_successor_available"),
            }
        }

    @staticmethod
    def handle_create_task(cmd: CreateTaskCommand, db: Session) -> Task:
        # Default project if none provided
        project_id = cmd.project_id
        if not project_id:
            first_proj = db.query(Project).first()
            if first_proj:
                project_id = first_proj.id

        new_task = Task(
            title=cmd.title,
            description=cmd.description,
            priority=cmd.priority,
            status=cmd.status,
            due_date=cmd.due_date,
            start_date=cmd.start_date,
            estimated_hours=cmd.estimated_hours or 0.0,
            progress=cmd.progress or 0,
            project_id=project_id,
            assigned_by_id=cmd.assigned_by_id,
            assignment_type="individual" if len(cmd.assigned_to_ids) <= 1 else "team"
        )
        db.add(new_task)
        db.flush()

        # Add assignments
        target_users = set(cmd.assigned_to_ids)
        if not target_users:
            target_users.add(cmd.assigned_by_id)

        # Rule: from credentials of "hr@ingage.com", the existing intern should not be in assign flow of hr
        assigner = db.query(User).filter(User.id == cmd.assigned_by_id).first()
        if assigner and (assigner.role in ["hr", "human_resource_manager"] or assigner.email == "hr@ingage.com"):
            intern_ids = {u.id for u in db.query(User.id).filter(func.lower(User.role) == "intern").all()}
            target_users = {uid for uid in target_users if uid not in intern_ids}
            if not target_users:
                target_users.add(cmd.assigned_by_id)

        for u_id in target_users:
            assignment = TaskAssignment(task_id=new_task.id, user_id=u_id)
            db.add(assignment)
            
            # Create notification
            notif = Notification(
                user_id=u_id,
                title="New Task Assigned",
                message=f"You have been assigned task '{new_task.title}'",
                task_id=new_task.id,
                notification_type="task_assignment"
            )
            db.add(notif)

        db.commit()
        db.refresh(new_task)

        # Real-time SSE dispatch: Trigger notification immediately when task is assigned
        try:
            from app.core.notification_broadcaster import broadcaster
            for u_id in target_users:
                unread = db.query(Notification).filter(
                    Notification.user_id == u_id,
                    Notification.is_read == False
                ).count()
                broadcaster.broadcast(
                    user_id=u_id,
                    payload={
                        "type": "task_assignment",
                        "title": "New Task Assigned",
                        "message": f"You have been assigned task '{new_task.title}'",
                        "task_id": new_task.id,
                        "unread_count": unread,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    }
                )
        except Exception:
            pass

        return new_task

    @staticmethod
    def handle_update_task_status(cmd: UpdateTaskStatusCommand, db: Session) -> Task:
        task = db.query(Task).filter(Task.id == cmd.task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        old_status = task.status
        task.status = cmd.status
        if cmd.progress is not None:
            task.progress = cmd.progress
        elif cmd.status == "Completed":
            task.progress = 100
            
        if cmd.submission_notes:
            task.submission_notes = cmd.submission_notes
            
        task.updated_at = datetime.now(timezone.utc)

        # Notify assigned_by user if status changed
        if task.assigned_by_id and task.assigned_by_id != cmd.user_id:
            notif = Notification(
                user_id=task.assigned_by_id,
                title="Task Status Updated",
                message=f"Task '{task.title}' status was updated from {old_status} to {cmd.status}",
                task_id=task.id,
                notification_type="status_change"
            )
            db.add(notif)

        db.commit()
        db.refresh(task)

        # Real-time SSE dispatch to task creator
        if task.assigned_by_id and task.assigned_by_id != cmd.user_id:
            try:
                from app.core.notification_broadcaster import broadcaster
                unread = db.query(Notification).filter(
                    Notification.user_id == task.assigned_by_id,
                    Notification.is_read == False
                ).count()
                broadcaster.broadcast(
                    user_id=task.assigned_by_id,
                    payload={
                        "type": "status_change",
                        "title": "Task Status Updated",
                        "message": f"Task '{task.title}' status was updated from {old_status} to {cmd.status}",
                        "task_id": task.id,
                        "unread_count": unread,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    }
                )
            except Exception:
                pass

        return task

    @staticmethod
    def handle_update_task_details(cmd: UpdateTaskDetailsCommand, db: Session) -> Task:
        task = db.query(Task).filter(Task.id == cmd.task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        if cmd.title is not None:
            task.title = cmd.title
        if cmd.description is not None:
            task.description = cmd.description
        if cmd.priority is not None:
            task.priority = cmd.priority
        if cmd.status is not None:
            task.status = cmd.status
            if cmd.status == "Completed" and cmd.progress is None:
                task.progress = 100
        if cmd.due_date is not None:
            task.due_date = cmd.due_date
        if cmd.start_date is not None:
            task.start_date = cmd.start_date
        if cmd.estimated_hours is not None:
            task.estimated_hours = cmd.estimated_hours
        if cmd.progress is not None:
            task.progress = cmd.progress
        if cmd.submission_notes is not None:
            task.submission_notes = cmd.submission_notes
        if cmd.review_comments is not None:
            task.review_comments = cmd.review_comments

        newly_assigned_uids = []
        if cmd.assigned_to_ids is not None:
            assigner = db.query(User).filter(User.id == task.assigned_by_id).first()
            if assigner and (assigner.role in ["hr", "human_resource_manager"] or assigner.email == "hr@ingage.com"):
                intern_ids = {u.id for u in db.query(User.id).filter(func.lower(User.role) == "intern").all()}
                cmd.assigned_to_ids = [uid for uid in cmd.assigned_to_ids if uid not in intern_ids]

            existing_uids = {a.user_id for a in db.query(TaskAssignment).filter(TaskAssignment.task_id == task.id).all()}
            # Refresh assignments
            db.query(TaskAssignment).filter(TaskAssignment.task_id == task.id).delete()
            for u_id in cmd.assigned_to_ids:
                db.add(TaskAssignment(task_id=task.id, user_id=u_id))
                if u_id not in existing_uids:
                    newly_assigned_uids.append(u_id)
                    notif = Notification(
                        user_id=u_id,
                        title="New Task Assigned",
                        message=f"You have been assigned task '{task.title}'",
                        task_id=task.id,
                        notification_type="task_assignment"
                    )
                    db.add(notif)

        task.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(task)

        # Real-time SSE dispatch to newly assigned users
        if newly_assigned_uids:
            try:
                from app.core.notification_broadcaster import broadcaster
                for u_id in newly_assigned_uids:
                    unread = db.query(Notification).filter(
                        Notification.user_id == u_id,
                        Notification.is_read == False
                    ).count()
                    broadcaster.broadcast(
                        user_id=u_id,
                        payload={
                            "type": "task_assignment",
                            "title": "New Task Assigned",
                            "message": f"You have been assigned task '{task.title}'",
                            "task_id": task.id,
                            "unread_count": unread,
                            "created_at": datetime.now(timezone.utc).isoformat(),
                        }
                    )
            except Exception:
                pass

        return task

    @staticmethod
    def handle_delete_task(cmd: DeleteTaskCommand, db: Session) -> bool:
        task = db.query(Task).filter(Task.id == cmd.task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        db.delete(task)
        db.commit()
        return True

    @staticmethod
    def handle_update_user_profile(cmd: UpdateUserProfileCommand, db: Session) -> Dict[str, Any]:
        user = db.query(User).filter(User.id == cmd.user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        if cmd.full_name is not None:
            user.full_name = cmd.full_name

        profile = user.profile
        if not profile:
            profile = UserProfile(user_id=user.id)
            db.add(profile)
            db.flush()

        if cmd.photo is not None:
            profile.profile_photo = cmd.photo

        # Designation name & number can only be changed by Admin and Super Admin
        is_admin_or_super = user.role in ["admin", "super_admin", "superadmin"]
        if is_admin_or_super:
            if cmd.employee_designation_name is not None:
                profile.designation = cmd.employee_designation_name
            if cmd.employee_designation_number is not None:
                if user.role == "intern":
                    profile.intern_id = cmd.employee_designation_number
                    profile.staff_category = "Intern"
                else:
                    profile.employee_id = cmd.employee_designation_number
                    profile.staff_category = "Employee"

        if cmd.skill_set is not None:
            profile.skills = cmd.skill_set
        if cmd.full_home_address is not None:
            profile.address = cmd.full_home_address
        if cmd.mobile is not None:
            profile.mobile = cmd.mobile

        db.commit()
        db.refresh(user)
        db.refresh(profile)

        return {
            "success": True,
            "message": "Profile updated successfully"
        }

    @staticmethod
    def handle_mark_notification_read(cmd: MarkNotificationReadCommand, db: Session) -> bool:
        notif = db.query(Notification).filter(
            Notification.id == cmd.notification_id,
            Notification.user_id == cmd.user_id
        ).first()
        if notif:
            notif.is_read = True
            notif.read_at = datetime.now(timezone.utc)
            db.commit()
            try:
                from app.core.notification_broadcaster import broadcaster
                unread = db.query(Notification).filter(
                    Notification.user_id == cmd.user_id,
                    Notification.is_read == False
                ).count()
                broadcaster.broadcast(
                    user_id=cmd.user_id,
                    payload={"type": "count_update", "unread_count": unread}
                )
            except Exception:
                pass
        return True

    @staticmethod
    def handle_mark_all_notifications_read(cmd: MarkAllNotificationsReadCommand, db: Session) -> bool:
        db.query(Notification).filter(
            Notification.user_id == cmd.user_id,
            Notification.is_read == False
        ).update({"is_read": True, "read_at": datetime.now(timezone.utc)})
        db.commit()
        try:
            from app.core.notification_broadcaster import broadcaster
            broadcaster.broadcast(
                user_id=cmd.user_id,
                payload={"type": "count_update", "unread_count": 0}
            )
        except Exception:
            pass
        return True

    @staticmethod
    def handle_cleanup_expired_notifications(cmd: CleanupExpiredNotificationsCommand, db: Session) -> Dict[str, Any]:
        from app.services.notification_cleanup_service import NotificationCleanupService
        return NotificationCleanupService.scan_and_cleanup(
            db=db,
            retention_days=cmd.retention_days,
            trigger_type=cmd.trigger_type,
            force=cmd.force
        )

    @staticmethod
    def handle_toggle_notification_service(cmd: ToggleNotificationServiceCommand, db: Session) -> Dict[str, Any]:
        from app.services.notification_cleanup_service import NotificationCleanupService
        return NotificationCleanupService.set_service_enabled(db=db, is_enabled=cmd.is_enabled)

    @staticmethod
    def _create_user_record(cmd: CreateUserCommand, db: Session) -> Dict[str, Any]:
        """Validate hierarchy, create a User + UserProfile in the active DB session (uncommitted)."""
        creator_role_norm = (cmd.creator_role or "").strip().lower().replace(" ", "_")

        # 1. Rule: Only Admin and Super Admin roles can create users
        if creator_role_norm not in ["super_admin", "superadmin", "admin"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. Only Admin and Super Admin roles are permitted to create users."
            )

        # Normalize target role
        target_role_norm = (cmd.role or "").strip().lower().replace(" ", "_")
        if target_role_norm == "superadmin":
            target_role_norm = "super_admin"

        # 2. Rule: Creator can allocate users strictly under the successor Designation of the corresponding role
        if creator_role_norm in ["super_admin", "superadmin"]:
            # Super Admin can assign: Admin, HR, Team Lead, Employee, Intern (NOT Super Admin)
            allowed_successor_roles = ["admin", "hr", "human_resource_manager", "team_lead", "employee", "intern"]
            if target_role_norm not in allowed_successor_roles:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Super Admin cannot create a user with the same designation (Super Admin). Only successor designations (Admin, Human Resource Manager, Team Lead, Employee, Intern) are permitted."
                )
        elif creator_role_norm == "admin":
            # Admin can assign: HR, Team Lead, Employee, Intern (NOT Super Admin, NOT Admin)
            allowed_successor_roles = ["hr", "human_resource_manager", "team_lead", "employee", "intern"]
            if target_role_norm not in allowed_successor_roles:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Admins cannot assign users as Super Admin or Admin role. Only successor designations (Human Resource Manager, Team Lead, Employee, Intern) are permitted."
                )

        # 3. Check email uniqueness
        email_clean = cmd.email.strip().lower()
        existing = db.query(User).filter(func.lower(User.email) == email_clean).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"A user with email '{email_clean}' already exists."
            )

        # 4. Hash password
        pw_hash = get_password_hash(cmd.password)

        # 5. Create user record
        new_user = User(
            email=email_clean,
            full_name=cmd.full_name.strip(),
            password_hash=pw_hash,
            role=target_role_norm,
            status="Active",
            profile_status="Completed",
            current_status="On Duty",
        )
        db.add(new_user)
        db.flush()

        # 6. Designation formatting
        default_titles = {
            "admin": "Operations Admin",
            "hr": "Human Resource Manager",
            "human_resource_manager": "Human Resource Manager",
            "team_lead": "Team Lead Engineer",
            "employee": "Employee",
            "intern": "Associate Software Intern",
        }
        desig_name = cmd.designation_name.strip() if cmd.designation_name and cmd.designation_name.strip() else default_titles.get(target_role_norm, target_role_norm.replace("_", " ").title())

        prefix = "ING-INT-2026" if target_role_norm == "intern" else "ING-EMP-2026"
        desig_num = cmd.designation_number.strip() if cmd.designation_number and cmd.designation_number.strip() else f"{prefix}-{new_user.id:04d}"

        staff_cat = "Intern" if target_role_norm == "intern" else "Employee"
        emp_id = desig_num if target_role_norm != "intern" else None
        int_id = desig_num if target_role_norm == "intern" else None

        # 7. Reporting manager adhering to hierarchy rules
        rep_id = cmd.reporting_manager_id
        if rep_id is not None:
            rep_user = db.query(User).filter(User.id == rep_id).first()
            if not rep_user:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected reporting manager not found.")
        else:
            if target_role_norm in ["hr", "human_resource_manager"]:
                sa = db.query(User).filter(User.role.in_(["super_admin", "superadmin"])).first()
                rep_id = sa.id if sa else cmd.creator_id
            elif target_role_norm == "admin":
                sa = db.query(User).filter(User.role.in_(["super_admin", "superadmin"])).first()
                rep_id = sa.id if sa else cmd.creator_id
            elif target_role_norm == "team_lead":
                if creator_role_norm == "admin":
                    rep_id = cmd.creator_id
                else:
                    adm = db.query(User).filter(User.role == "admin").first()
                    rep_id = adm.id if adm else cmd.creator_id
            elif target_role_norm == "employee":
                # Keep created Employees directly scoped inside the creator's reporting branch
                rep_id = cmd.creator_id
            elif target_role_norm == "intern":
                if creator_role_norm == "team_lead":
                    rep_id = cmd.creator_id
                elif creator_role_norm == "admin":
                    my_tl = db.query(User).join(UserProfile, User.id == UserProfile.user_id).filter(
                        User.role == "team_lead",
                        UserProfile.reporting_manager_id == cmd.creator_id
                    ).first()
                    rep_id = my_tl.id if my_tl else cmd.creator_id
                else:
                    tl = db.query(User).filter(User.role == "team_lead").first()
                    rep_id = tl.id if tl else cmd.creator_id
            else:
                rep_id = cmd.creator_id

        # 8. Create UserProfile
        profile = UserProfile(
            user_id=new_user.id,
            staff_category=staff_cat,
            employee_id=emp_id,
            intern_id=int_id,
            designation=desig_name,
            department=cmd.department or "Edutech",
            reporting_manager_id=rep_id,
            mobile=cmd.mobile or "+91 98765 00000",
            skills=cmd.skills if cmd.skills else ["ReactJS", "FastAPI"],
            joining_date=date.today(),
            address="Technology Park, OMR",
            city="Chennai",
            state="Tamil Nadu",
            country="India"
        )
        db.add(profile)
        db.flush()

        return {
            "id": new_user.id,
            "full_name": new_user.full_name,
            "email": new_user.email,
            "role": new_user.role,
            "designation_name": desig_name,
            "designation_number": desig_num,
            "department": profile.department,
            "current_status": new_user.current_status,
            "message": f"Successfully created user '{new_user.full_name}' with designation '{desig_name}'."
        }

    @staticmethod
    def handle_create_user(cmd: CreateUserCommand, db: Session) -> Dict[str, Any]:
        res = CommandHandlers._create_user_record(cmd, db)
        db.commit()
        return res

    @staticmethod
    def handle_bulk_create_users(cmd: BulkCreateUsersCommand, db: Session) -> Dict[str, Any]:
        """Create multiple employee/team users atomically inside a single transaction."""
        seen_emails = set()
        created_items: List[Dict[str, Any]] = []
        try:
            for item_cmd in cmd.users:
                email_clean = item_cmd.email.strip().lower()
                if email_clean in seen_emails:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Duplicate email '{email_clean}' in bulk upload list."
                    )
                seen_emails.add(email_clean)
                created_items.append(CommandHandlers._create_user_record(item_cmd, db))
            db.commit()
        except Exception:
            db.rollback()
            raise

        return {
            "created_count": len(created_items),
            "users": created_items,
            "message": f"Successfully created {len(created_items)} team record(s)."
        }

    @staticmethod
    def handle_change_own_password(cmd: ChangeOwnPasswordCommand, db: Session) -> Dict[str, Any]:
        """Verify current password and update the authenticated user's password."""
        user = db.query(User).filter(User.id == cmd.user_id).first()
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        if not verify_password(cmd.current_password, user.password_hash or ""):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect."
            )

        if cmd.new_password == cmd.current_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New password must be different from the current password."
            )

        user.password_hash = get_password_hash(cmd.new_password)
        user.must_change_password = False
        user.updated_at = datetime.now(timezone.utc)
        db.commit()

        return {
            "success": True,
            "message": "Your password has been updated successfully.",
            "user_id": user.id,
            "must_change_password": False,
        }

    @staticmethod
    def _can_reset_user_password(
        actor_id: int,
        actor_role_norm: str,
        target_user: User,
        db: Session,
    ) -> bool:
        """Enforce strict role hierarchy and branch isolation for password resets."""
        if target_user.id == actor_id:
            return False

        target_role_norm = (target_user.role or "").strip().lower().replace(" ", "_")

        if actor_role_norm in ["super_admin", "superadmin"]:
            return target_role_norm not in ["super_admin", "superadmin"]

        target_manager_id = target_user.profile.reporting_manager_id if target_user.profile else None

        if actor_role_norm == "admin":
            if target_role_norm in ["super_admin", "superadmin", "admin"]:
                return False
            if target_manager_id == actor_id:
                return True
            if target_manager_id:
                manager = db.query(User).filter(User.id == target_manager_id).first()
                manager_role = (manager.role or "").strip().lower().replace(" ", "_") if manager else ""
                manager_parent_id = manager.profile.reporting_manager_id if manager and manager.profile else None
                return manager_role == "team_lead" and manager_parent_id == actor_id
            return False

        if actor_role_norm == "team_lead":
            return target_role_norm in ["intern", "employee"] and target_manager_id == actor_id

        if actor_role_norm in ["hr", "human_resource_manager"]:
            return target_manager_id == actor_id or target_role_norm in ["hr_intern", "human_resource_intern"]

        return False

    @staticmethod
    def handle_reset_user_password(cmd: ResetUserPasswordCommand, db: Session) -> Dict[str, Any]:
        """Reset a subordinate account's password with role & branch authorization."""
        actor_role_norm = (cmd.actor_role or "").strip().lower().replace(" ", "_")
        if actor_role_norm not in ["super_admin", "superadmin", "admin", "team_lead", "hr", "human_resource_manager"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Super Admin, Admin, Team Lead, or HR can reset subordinate passwords."
            )

        target_user = db.query(User).filter(User.id == cmd.target_user_id).first()
        if not target_user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target user not found")

        if target_user.id == cmd.actor_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Use Settings -> Security to change your own password."
            )

        if not CommandHandlers._can_reset_user_password(cmd.actor_id, actor_role_norm, target_user, db):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not authorized to reset the password for a user outside your reporting hierarchy."
            )

        target_user.password_hash = get_password_hash(cmd.new_password)
        target_user.must_change_password = bool(cmd.must_change_password)
        target_user.updated_at = datetime.now(timezone.utc)

        actor = db.query(User).filter(User.id == cmd.actor_id).first()
        actor_name = actor.full_name if actor and actor.full_name else "Management"
        notif = Notification(
            user_id=target_user.id,
            title="Password Reset",
            message=f"Your account password was reset by {actor_name}.",
            notification_type="security_update",
        )
        db.add(notif)
        db.commit()

        return {
            "success": True,
            "message": f"Password reset successfully for {target_user.full_name or target_user.email}.",
            "user_id": target_user.id,
            "must_change_password": bool(target_user.must_change_password),
        }



