from datetime import date, datetime
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, desc, asc
from fastapi import HTTPException, status

from app.models.domain import User, UserProfile, Task, TaskAssignment, Notification, Project
from app.cqrs.queries.dashboard_queries import GetDashboardStatsQuery
from app.cqrs.queries.task_queries import GetTasksQuery, GetBoardTasksQuery, GetTaskByIdQuery, GetProjectAnalysisQuery
from app.cqrs.queries.team_queries import GetHierarchyQuery
from app.cqrs.queries.user_queries import GetUserProfileQuery
from app.cqrs.queries.notification_queries import GetNotificationsQuery
from app.models.schemas import TaskResponse, TaskAssigneeResponse, WorkCountMetrics
from app.core.notification_broadcaster import broadcaster
from app.core.websocket_manager import ws_manager

class QueryHandlers:
    @staticmethod
    def get_descendant_user_ids(manager_id: int, db: Session) -> List[int]:
        """
        Recursively collects all user IDs reporting directly or indirectly to manager_id.
        Follows the strict hierarchy flow: Super Admin -> Admin -> Team Lead -> Intern.
        """
        direct_subordinates = [
            p.user_id for p in db.query(UserProfile.user_id)
            .filter(UserProfile.reporting_manager_id == manager_id).all()
        ]
        all_subordinates = list(direct_subordinates)
        for sub_id in direct_subordinates:
            all_subordinates.extend(QueryHandlers.get_descendant_user_ids(sub_id, db))
        return list(set(all_subordinates))

    @staticmethod
    def get_user_and_successor_ids(user_id: int, role: str, db: Session) -> Optional[List[int]]:
        """
        Returns list of user IDs for the user and their successors.
        If user is Super Admin, returns None (meaning unrestricted organizational overview).
        For Admin: returns user_id plus ONLY descendants reporting to this Admin's flow.
                   This prevents Admin 2 from seeing Admin 1's flow.
        For Team Lead: returns user_id plus interns reporting to this Team Lead.
        For HR: Rule 4 (Super_Admin -> HR) has no correlate with intern, team_lead, or admin.
        For Intern: only self.
        """
        role_norm = (role or "").lower().replace(" ", "_")
        if role_norm in ["super_admin", "superadmin"]:
            return None

        if role_norm in ["hr", "human_resource_manager"]:
            # Rule 4: Super_Admin -> HR (No correlate with intern, team_lead, or admin)
            return [user_id]

        if role_norm == "admin":
            # Scoped to own hierarchy flow: Admin -> Team Lead -> Intern
            descendants = QueryHandlers.get_descendant_user_ids(user_id, db)
            return list(set([user_id] + descendants))

        if role_norm in ["team_lead", "employee"]:
            # Successors: direct reports (if any) + self
            descendants = QueryHandlers.get_descendant_user_ids(user_id, db)
            if not descendants and role_norm == "team_lead":
                descendants = [
                    prof.user_id for prof in db.query(UserProfile).filter(UserProfile.reporting_manager_id == user_id).all()
                ]
            return list(set([user_id] + descendants))

        # For intern (and other individual roles): no successors, only self
        return [user_id]

    @staticmethod
    def _task_to_response(task: Task) -> Dict[str, Any]:
        assignees = []
        for a in task.assignments:
            if a.user:
                prof = a.user.profile
                assignees.append({
                    "id": a.user.id,
                    "full_name": a.user.full_name or a.user.email,
                    "email": a.user.email,
                    "role": a.user.role,
                    "avatar": prof.profile_photo if prof else None,
                    "designation": prof.designation if prof else a.user.role.replace("_", " ").title()
                })

        assigned_by_user = task.assigned_by
        assigned_by_name = assigned_by_user.full_name if assigned_by_user else "Manager"
        assigned_by_role = assigned_by_user.role if assigned_by_user else None
        assigned_by_avatar = assigned_by_user.profile.profile_photo if (assigned_by_user and assigned_by_user.profile) else None
        assigned_by_designation = (assigned_by_user.profile.designation if (assigned_by_user and assigned_by_user.profile and assigned_by_user.profile.designation) else (assigned_by_role.replace("_", " ").title() if assigned_by_role else "Management"))

        return {
            "id": task.id,
            "title": task.title,
            "description": task.description,
            "status": task.status,
            "priority": task.priority,
            "progress": task.progress,
            "due_date": task.due_date,
            "start_date": task.start_date,
            "estimated_hours": float(task.estimated_hours) if task.estimated_hours else 0.0,
            "project_id": task.project_id,
            "project_name": task.project.name if task.project else "General Project",
            "assigned_by_id": task.assigned_by_id,
            "assigned_by_name": assigned_by_name,
            "assigned_by_role": assigned_by_role,
            "assigned_by_avatar": assigned_by_avatar,
            "assigned_by_designation": assigned_by_designation,
            "assignees": assignees,
            "submission_notes": task.submission_notes,
            "review_comments": task.review_comments,
            "created_at": task.created_at,
            "updated_at": task.updated_at,
        }

    @staticmethod
    def _member_to_item(user: User, db: Session) -> Dict[str, Any]:
        prof = user.profile
        desig_num = ""
        desig_name = user.role.replace("_", " ").title()
        skills = []
        photo = None
        mobile = None
        dept = "Edutech"
        rep_id = None

        if prof:
            desig_num = prof.intern_id or prof.employee_id or prof.staff_id or f"ING-{user.id:04d}"
            desig_name = prof.designation or desig_name
            skills = prof.skills if isinstance(prof.skills, list) else []
            photo = prof.profile_photo
            mobile = prof.mobile
            dept = prof.department or "Edutech"
            rep_id = prof.reporting_manager_id

        # Calculate active tasks count
        active_count = db.query(TaskAssignment).join(Task).filter(
            TaskAssignment.user_id == user.id,
            Task.status.in_(["In Progress", "Backlog", "Under Review", "Overdue"])
        ).count()

        # Real-time WebSocket verification: If the employee is connected via WebSocket -> Available, otherwise NA
        is_available = ws_manager.is_user_available(user.id) or broadcaster.is_user_logged_in(user.id)

        return {
            "id": user.id,
            "full_name": user.full_name or user.email.split("@")[0].title(),
            "email": user.email,
            "role": user.role,
            "designation_name": desig_name,
            "designation_number": desig_num,
            "department": dept,
            "photo": photo,
            "mobile": mobile,
            "current_status": user.current_status or "On Duty",
            "reporting_manager_id": rep_id,
            "active_tasks_count": active_count,
            "skills": skills,
            "is_available": is_available,
            "availability_status": "Available" if is_available else "NA",
        }

    @staticmethod
    def handle_get_dashboard_stats(query: GetDashboardStatsQuery, db: Session) -> Dict[str, Any]:
        today = date.today()
        user = db.query(User).filter(User.id == query.user_id).first()
        user_name = user.full_name if user and user.full_name else "User"
        current_status = user.current_status if user and user.current_status else "On Duty"
        department = user.profile.department if user and user.profile and user.profile.department else "Edutech"

        # Determine tasks in scope: In the specific of "task count analysis", present only the corresponding role user's assigned task count
        role_norm = (query.role or "").lower().replace(" ", "_")
        my_assigned_task_ids = db.query(TaskAssignment.task_id).filter(TaskAssignment.user_id == query.user_id).subquery()
        if role_norm == "intern":
            # Intern sees only their assigned tasks
            tasks_query = db.query(Task).filter(Task.id.in_(my_assigned_task_ids))
        elif role_norm in ["hr", "human_resource_manager"]:
            # Rule 4: Super_Admin -> HR (No correlation with intern, team_lead, or admin)
            # HR sees only tasks assigned to HR or created by HR; existing interns must not be in assign flow of HR
            intern_task_ids = db.query(TaskAssignment.task_id).filter(
                TaskAssignment.user_id.in_(db.query(User.id).filter(func.lower(User.role) == "intern"))
            ).subquery()
            tasks_query = db.query(Task).filter(
                or_(Task.id.in_(my_assigned_task_ids), Task.assigned_by_id == query.user_id),
                ~Task.id.in_(intern_task_ids)
            )
        else:
            # Super Admin, Admin, Team Lead: present only this corresponding role user's assigned/allocated task count
            tasks_query = db.query(Task).filter(
                or_(Task.id.in_(my_assigned_task_ids), Task.assigned_by_id == query.user_id)
            )

        all_tasks = tasks_query.all()

        completed_count = 0
        in_progress_count = 0
        under_review_count = 0
        backlog_count = 0
        overdue_count = 0
        total_hours = 0.0

        for t in all_tasks:
            # Overdue logic: explicit status Overdue OR due_date passed and status not Completed
            is_overdue = (t.status == "Overdue") or (t.due_date and t.due_date < today and t.status != "Completed")
            
            if t.status == "Completed":
                completed_count += 1
            elif is_overdue:
                overdue_count += 1
            elif t.status == "In Progress":
                in_progress_count += 1
            elif t.status == "Under Review":
                under_review_count += 1
            elif t.status == "Backlog":
                backlog_count += 1
            else:
                in_progress_count += 1
                
            if t.estimated_hours:
                total_hours += float(t.estimated_hours)

        total_count = len(all_tasks)
        completion_rate = round((completed_count / total_count * 100), 1) if total_count > 0 else 0.0

        # Recent 5 tasks
        recent_tasks = [QueryHandlers._task_to_response(t) for t in all_tasks[:5]]

        # Team members availability for Manager and its above (except Intern and Team Leader)
        role_norm = (query.role or "").lower().replace(" ", "_")
        curr_user = db.query(User).filter(User.id == query.user_id).first()
        is_hr_user = role_norm in ["hr", "human_resource_manager"] or (curr_user and (curr_user.email or "").lower() == "hr@ingage.com")

        all_users = db.query(User).all()
        super_admins = [u for u in all_users if u.role in ["super_admin", "Super Admin"]]
        admins = [u for u in all_users if u.role in ["admin", "Admin"]]
        hrs = [u for u in all_users if u.role in ["hr", "human_resource_manager"] or (u.profile and "human resource" in (u.profile.designation or "").lower())]
        team_leads = [u for u in all_users if u.role in ["team_lead", "Team Lead"]]
        employees = [u for u in all_users if (u.role or "").lower().replace(" ", "_") == "employee"]

        # General engineering interns under Team Lead
        engineering_interns = [
            u for u in all_users 
            if (u.role or "").lower() == "intern" and not (
                (u.role or "").lower() in ["hr_intern", "human_resource_intern"] or
                (u.profile and "hr" in (u.profile.designation or "").lower())
            )
        ]

        # HR-related roles: hr_intern, human_resource_intern, or reporting to HR, or in HR department with intern/assistant
        hr_related_roles = [
            u for u in all_users
            if u.id != query.user_id and (
                (u.role or "").lower() in ["hr_intern", "human_resource_intern"] or
                (u.profile and "hr intern" in (u.profile.designation or "").lower()) or
                (u.profile and (u.profile.reporting_manager_id in [h.id for h in hrs]))
            )
        ]

        sa_user = db.query(User).filter(User.role.in_(["super_admin", "superadmin"])).first()

        if role_norm in ["super_admin", "superadmin"]:
            # Rule 1 & Rule 4: Super_Admin -> Admin -> Team_Lead -> Employee / Intern and Super_Admin -> HR
            target_users = [u for u in (admins + hrs + team_leads + employees + engineering_interns + hr_related_roles) if u.id != query.user_id]
            hierarchy_flow_str = "super_admin -> admin -> team_lead -> employee / intern (and super_admin -> hr)"
            predecessor_name_str = "None (Top Level)"

        elif role_norm == "admin":
            # Rule 2: Admin -> Team_Lead -> Employee / Intern (Scoped strictly to this Admin's own flow)
            my_team_leads = [
                tl for tl in team_leads 
                if tl.profile and tl.profile.reporting_manager_id == query.user_id
            ]
            my_tl_ids = [tl.id for tl in my_team_leads]
            my_employees = [
                emp for emp in employees
                if emp.profile and (emp.profile.reporting_manager_id in my_tl_ids or emp.profile.reporting_manager_id == query.user_id)
            ]
            my_interns = [
                i for i in engineering_interns
                if i.profile and (i.profile.reporting_manager_id in my_tl_ids or i.profile.reporting_manager_id == query.user_id)
            ]
            target_users = [u for u in (my_team_leads + my_employees + my_interns) if u.id != query.user_id]
            hierarchy_flow_str = "admin -> team_lead -> employee / intern (scoped branch)"
            predecessor_name_str = sa_user.full_name if sa_user else "Super Admin"

        elif is_hr_user:
            # Rule 4: (super_admin -> hr) or (super_admin -> hr -> hr_intern) or (super_admin -> any_roles_relate_with_hr)
            # Successor count aligns strictly with HR-related roles (NOT with all tasks)
            target_users = hr_related_roles
            predecessor_name_str = sa_user.full_name if sa_user else "Super Admin"
            if hr_related_roles:
                hierarchy_flow_str = "super_admin -> hr -> hr_intern"
            else:
                hierarchy_flow_str = "super_admin -> hr"

        elif role_norm in ["team_lead", "team_leader", "teamleader"]:
            # Rule 3: Team_Lead -> Employee / Intern
            tl_employees = [
                u for u in employees
                if (u.profile and u.profile.reporting_manager_id == query.user_id)
            ]
            tl_interns = [
                u for u in engineering_interns 
                if (u.profile and u.profile.reporting_manager_id == query.user_id)
            ]
            target_users = tl_employees + tl_interns
            hierarchy_flow_str = "team_lead -> employee / intern"
            mgr_id = curr_user.profile.reporting_manager_id if curr_user and curr_user.profile else None
            adm_user = db.query(User).filter(User.id == mgr_id).first() if mgr_id else None
            if not adm_user:
                adm_user = db.query(User).filter(User.role.in_(["admin", "Admin"])).first()
            predecessor_name_str = adm_user.full_name if adm_user else "Admin (Director)"

        elif role_norm == "employee":
            mgr_id = curr_user.profile.reporting_manager_id if curr_user and curr_user.profile else None
            mgr_user = db.query(User).filter(User.id == mgr_id).first() if mgr_id else None
            if not mgr_user:
                mgr_user = db.query(User).filter(User.role.in_(["admin", "Admin"])).first()
            predecessor_name_str = mgr_user.full_name if mgr_user else "Manager"
            peer_employees = [
                u for u in employees
                if u.id != query.user_id and (not mgr_id or (u.profile and u.profile.reporting_manager_id == mgr_id))
            ]
            sub_interns = [
                u for u in engineering_interns
                if u.profile and u.profile.reporting_manager_id == query.user_id
            ]
            target_users = sub_interns + peer_employees
            hierarchy_flow_str = "admin / team_lead -> employee"

        else: # intern
            # Intern sees peer interns reporting to the same Team Lead
            mgr_id = curr_user.profile.reporting_manager_id if curr_user and curr_user.profile else None
            tl_user = db.query(User).filter(User.id == mgr_id).first() if mgr_id else None
            if not tl_user:
                tl_user = db.query(User).filter(User.role.in_(["team_lead", "Team Lead"])).first()
            predecessor_name_str = tl_user.full_name if tl_user else "Team Lead"
            peer_interns = [
                u for u in engineering_interns 
                if u.id != query.user_id and (not mgr_id or (u.profile and u.profile.reporting_manager_id == mgr_id))
            ]
            target_users = peer_interns
            hierarchy_flow_str = "team_lead -> intern (peer team)"

        team_members_list = []
        for m in target_users:
            item = QueryHandlers._member_to_item(m, db)
            # WebSocket presence verification: If the employee has an active WebSocket -> Available, otherwise NA
            is_available = ws_manager.is_user_available(m.id) or broadcaster.is_user_logged_in(m.id)
            item["is_available"] = is_available
            item["availability_status"] = "Available" if is_available else "NA"
            team_members_list.append(item)

        # Presentable in top-bottom order format: Available employees at the top, NA at the bottom
        team_members_list.sort(key=lambda x: (not x["is_available"], x.get("full_name", "")))

        if is_hr_user:
            employee_count_str = str(len(team_members_list))
            successor_avail_str = "Available" if any(x["is_available"] for x in team_members_list) else "0"
        elif team_members_list:
            employee_count_str = str(len(team_members_list))
            successor_avail_str = "Available" if any(x["is_available"] for x in team_members_list) else "NA"
        else:
            employee_count_str = "0" if is_hr_user else "NA"
            successor_avail_str = "0" if is_hr_user else "NA"

        return {
            "role": query.role,
            "user_name": user_name,
            "work_counts": {
                "completed": completed_count,
                "in_progress": in_progress_count,
                "under_review": under_review_count,
                "backlog": backlog_count,
                "overdue": overdue_count,
                "total": total_count,
                "completion_rate": completion_rate,
            },
            "weekly_hours": total_hours,
            "current_status": current_status,
            "department": department,
            "recent_tasks": recent_tasks,
            "performance_summary": {
                "efficiency": 94 if completed_count > 0 else 85,
                "on_time_delivery_rate": 96.5,
                "pending_reviews": under_review_count,
            },
            "team_members": team_members_list,
            "employee_count": employee_count_str,
            "successor_account_available": successor_avail_str,
            "hierarchy_flow": hierarchy_flow_str,
            "predecessor_name": predecessor_name_str,
        }

    @staticmethod
    def handle_get_tasks(query: GetTasksQuery, db: Session) -> Dict[str, Any]:
        today = date.today()
        base_query = db.query(Task)

        # Rule: except Admin and Super Admin, rest of the users should present only their project and follows with successors users
        allowed_ids = QueryHandlers.get_user_and_successor_ids(query.user_id, query.role, db)
        if allowed_ids is not None:
            assigned_task_ids = db.query(TaskAssignment.task_id).filter(
                TaskAssignment.user_id.in_(allowed_ids)
            ).subquery()
            base_query = base_query.filter(
                or_(
                    Task.id.in_(assigned_task_ids),
                    Task.assigned_by_id.in_(allowed_ids)
                )
            )

        role_norm = (query.role or "").lower().replace(" ", "_")
        if role_norm in ["hr", "human_resource_manager"]:
            # Rule: from credentials of hr@ingage.com, existing intern should not be in assign flow of hr
            intern_subq = db.query(TaskAssignment.task_id).filter(
                TaskAssignment.user_id.in_(db.query(User.id).filter(func.lower(User.role) == "intern"))
            ).subquery()
            base_query = base_query.filter(~Task.id.in_(intern_subq))

        # Filter by status
        if query.status and query.status.lower() != "all":
            if query.status.lower() == "overdue":
                base_query = base_query.filter(
                    or_(Task.status == "Overdue", (Task.due_date < today) & (Task.status != "Completed"))
                )
            else:
                base_query = base_query.filter(func.lower(Task.status) == query.status.lower())

        # Filter by priority
        if query.priority and query.priority.lower() != "all":
            base_query = base_query.filter(func.lower(Task.priority) == query.priority.lower())

        # Filter by search term
        if query.search:
            s = f"%{query.search.strip()}%"
            base_query = base_query.filter(or_(Task.title.ilike(s), Task.description.ilike(s)))

        # Sorting
        order_fn = desc if query.sort_order == "desc" else asc
        sort_field = (query.sort_by or "id").lower()
        if sort_field in ["id", "task_id"]:
            base_query = base_query.order_by(order_fn(Task.id))
        elif sort_field == "title":
            base_query = base_query.order_by(order_fn(Task.title))
        elif sort_field in ["assigned_by", "assigned_by_name"]:
            base_query = base_query.join(User, Task.assigned_by_id == User.id, isouter=True).order_by(order_fn(User.full_name))
        elif sort_field in ["progress", "completion"]:
            base_query = base_query.order_by(order_fn(Task.progress))
        elif sort_field == "priority":
            base_query = base_query.order_by(order_fn(Task.priority))
        elif sort_field == "status":
            base_query = base_query.order_by(order_fn(Task.status))
        elif sort_field in ["project", "project_name"]:
            base_query = base_query.join(Project, Task.project_id == Project.id, isouter=True).order_by(order_fn(Project.name))
        elif sort_field in ["due_date", "date"]:
            base_query = base_query.order_by(order_fn(Task.due_date))
        else:
            base_query = base_query.order_by(order_fn(Task.id))

        total = base_query.count()
        offset = (query.page - 1) * query.page_size
        items = base_query.offset(offset).limit(query.page_size).all()
        total_pages = max(1, (total + query.page_size - 1) // query.page_size)

        return {
            "items": [QueryHandlers._task_to_response(t) for t in items],
            "total": total,
            "page": query.page,
            "page_size": query.page_size,
            "total_pages": total_pages,
        }

    @staticmethod
    def handle_get_board_tasks(query: GetBoardTasksQuery, db: Session) -> Dict[str, Any]:
        today = date.today()
        base_query = db.query(Task)

        # Rule: except Admin and Super Admin, rest of the users should present only their project and follows with successors users
        allowed_ids = QueryHandlers.get_user_and_successor_ids(query.user_id, query.role, db)
        if allowed_ids is not None:
            assigned_task_ids = db.query(TaskAssignment.task_id).filter(
                TaskAssignment.user_id.in_(allowed_ids)
            ).subquery()
            base_query = base_query.filter(
                or_(
                    Task.id.in_(assigned_task_ids),
                    Task.assigned_by_id.in_(allowed_ids)
                )
            )

        role_norm = (query.role or "").lower().replace(" ", "_")
        if role_norm in ["hr", "human_resource_manager"]:
            # Rule: from credentials of hr@ingage.com, existing intern should not be in assign flow of hr
            intern_subq = db.query(TaskAssignment.task_id).filter(
                TaskAssignment.user_id.in_(db.query(User.id).filter(func.lower(User.role) == "intern"))
            ).subquery()
            base_query = base_query.filter(~Task.id.in_(intern_subq))

        if query.search:
            s = f"%{query.search.strip()}%"
            base_query = base_query.filter(or_(Task.title.ilike(s), Task.description.ilike(s)))

        tasks = base_query.all()

        columns_data = {
            "Backlog": [],
            "In Progress": [],
            "Under Review": [],
            "Completed": [],
            "Overdue": []
        }

        for t in tasks:
            resp = QueryHandlers._task_to_response(t)
            is_overdue = (t.status == "Overdue") or (t.due_date and t.due_date < today and t.status != "Completed")
            
            if is_overdue and t.status != "Completed":
                columns_data["Overdue"].append(resp)
            elif t.status in columns_data:
                columns_data[t.status].append(resp)
            else:
                columns_data["In Progress"].append(resp)

        result_columns = [
            {"id": "Backlog", "name": "Backlog / To Do", "count": len(columns_data["Backlog"]), "tasks": columns_data["Backlog"]},
            {"id": "In Progress", "name": "In Progress", "count": len(columns_data["In Progress"]), "tasks": columns_data["In Progress"]},
            {"id": "Under Review", "name": "Under Review", "count": len(columns_data["Under Review"]), "tasks": columns_data["Under Review"]},
            {"id": "Completed", "name": "Completed", "count": len(columns_data["Completed"]), "tasks": columns_data["Completed"]},
            {"id": "Overdue", "name": "Overdue", "count": len(columns_data["Overdue"]), "tasks": columns_data["Overdue"]},
        ]

        return {"columns": result_columns}

    @staticmethod
    def handle_get_task_by_id(query: GetTaskByIdQuery, db: Session) -> Dict[str, Any]:
        task = db.query(Task).filter(Task.id == query.task_id).first()
        if not task:
            return None
        return QueryHandlers._task_to_response(task)

    @staticmethod
    def handle_get_hierarchy(query: GetHierarchyQuery, db: Session) -> Dict[str, Any]:
        current_user = db.query(User).filter(User.id == query.user_id).first()
        all_users = db.query(User).all()

        # Group users by normalized role
        super_admins = [u for u in all_users if u.role in ["super_admin", "Super Admin"]]
        admins = [u for u in all_users if u.role in ["admin", "Admin"]]
        hrs = [u for u in all_users if u.role in ["hr", "human_resource_manager"] or (u.profile and "human resource" in (u.profile.designation or "").lower())]
        team_leads = [u for u in all_users if u.role in ["team_lead", "Team Lead"]]
        employees = [u for u in all_users if (u.role or "").lower().replace(" ", "_") == "employee"]
        interns = [u for u in all_users if u.role in ["intern", "Intern"]]

        predecessors: List[Dict[str, Any]] = []
        successors: List[Dict[str, Any]] = []
        peers: List[Dict[str, Any]] = []
        hierarchy_chain: List[Dict[str, Any]] = []

        user_role_norm = current_user.role.lower().replace(" ", "_") if current_user else query.role.lower().replace(" ", "_")
        is_hr_user = user_role_norm in ["hr", "human_resource_manager"] or (current_user and current_user.profile and "human resource" in (current_user.profile.designation or "").lower())

        if user_role_norm == "employee":
            # Employee Designation: 1st predecessor is direct manager (Admin / Team Lead / Super Admin)
            manager_id = current_user.profile.reporting_manager_id if current_user and current_user.profile else None
            direct_manager = db.query(User).filter(User.id == manager_id).first() if manager_id else (admins[0] if admins else (team_leads[0] if team_leads else None))
            if direct_manager:
                predecessors.append(QueryHandlers._member_to_item(direct_manager, db))

            assigned_subordinates = [i for i in interns if i.profile and i.profile.reporting_manager_id == current_user.id]
            successors = [QueryHandlers._member_to_item(i, db) for i in assigned_subordinates]

            peers = [
                QueryHandlers._member_to_item(emp, db) for emp in employees
                if emp.id != current_user.id and (not manager_id or (emp.profile and emp.profile.reporting_manager_id == manager_id))
            ]

            top = super_admins[0] if super_admins else None
            if top and (not direct_manager or top.id != direct_manager.id):
                hierarchy_chain.append(QueryHandlers._member_to_item(top, db))
            if direct_manager:
                hierarchy_chain.append(QueryHandlers._member_to_item(direct_manager, db))
            if current_user:
                hierarchy_chain.append(QueryHandlers._member_to_item(current_user, db))

        elif user_role_norm == "intern":
            # For Intern Designation: Showing their Higher Designation position Person
            # 1. Direct Reporting Manager (Team Lead)
            manager_id = current_user.profile.reporting_manager_id if current_user and current_user.profile else None
            direct_manager = db.query(User).filter(User.id == manager_id).first() if manager_id else (team_leads[0] if team_leads else None)
            
            # 2. Direct Admin above this Team Lead
            admin_above = None
            if direct_manager and direct_manager.profile and direct_manager.profile.reporting_manager_id:
                admin_above = db.query(User).filter(User.id == direct_manager.profile.reporting_manager_id).first()
            if not admin_above and admins:
                admin_above = admins[0]

            # 1 Predecessor: Direct Reporting Manager (Team Lead)
            if direct_manager:
                predecessors.append(QueryHandlers._member_to_item(direct_manager, db))

            # Peers: only other interns reporting to the SAME Team Lead
            peers = [
                QueryHandlers._member_to_item(i, db) for i in interns 
                if i.id != current_user.id and (not manager_id or (i.profile and i.profile.reporting_manager_id == manager_id))
            ]

            # Hierarchy Chain for intern: Super Admin -> Admin -> Team Lead -> This Intern
            top = super_admins[0] if super_admins else None
            adm = admin_above or (admins[0] if admins else None)
            tl = direct_manager or (team_leads[0] if team_leads else None)
            if top: hierarchy_chain.append(QueryHandlers._member_to_item(top, db))
            if adm: hierarchy_chain.append(QueryHandlers._member_to_item(adm, db))
            if tl: hierarchy_chain.append(QueryHandlers._member_to_item(tl, db))
            if current_user: hierarchy_chain.append(QueryHandlers._member_to_item(current_user, db))

        elif is_hr_user:
            # Rule 4: Super_Admin -> HR (Immediate higher officer / manager is Super Admin)
            manager_id = current_user.profile.reporting_manager_id if current_user and current_user.profile else None
            direct_manager = db.query(User).filter(User.id == manager_id).first() if manager_id else (super_admins[0] if super_admins else None)

            # 1 Predecessor: Super Admin (Higher Officer directly above HR)
            if direct_manager:
                predecessors.append(QueryHandlers._member_to_item(direct_manager, db))

            # Rule 4: There is no successor for HR (if needed, Super Admin and Admin can create it)
            successors = []

            # Peers: Other HR personnel
            peers = [QueryHandlers._member_to_item(h, db) for h in hrs if h.id != current_user.id]

            # Hierarchy Chain for HR: Super_Admin -> HR
            top = direct_manager or (super_admins[0] if super_admins else None)
            if top: hierarchy_chain.append(QueryHandlers._member_to_item(top, db))
            if current_user: hierarchy_chain.append(QueryHandlers._member_to_item(current_user, db))

        elif user_role_norm == "team_lead":
            # Rule 3: Team_Lead -> Intern (and Rule 2: Admin -> Team_Lead -> Intern)
            # 1 Predecessor: Direct Admin that this TL reports to
            manager_id = current_user.profile.reporting_manager_id if current_user and current_user.profile else None
            direct_admin = db.query(User).filter(User.id == manager_id).first() if manager_id else (admins[0] if admins else None)
            
            if direct_admin:
                predecessors.append(QueryHandlers._member_to_item(direct_admin, db))

            # Successors: Employees and Interns reporting directly to this specific Team Lead
            assigned_employees = [emp for emp in employees if emp.profile and emp.profile.reporting_manager_id == current_user.id]
            assigned_interns = [i for i in interns if i.profile and i.profile.reporting_manager_id == current_user.id]
            successors = [QueryHandlers._member_to_item(m, db) for m in (assigned_employees + assigned_interns)]

            # Peers: other Team Leads reporting to the same Admin
            peers = [
                QueryHandlers._member_to_item(tl, db) for tl in team_leads 
                if tl.id != current_user.id and (not manager_id or (tl.profile and tl.profile.reporting_manager_id == manager_id))
            ]

            top = super_admins[0] if super_admins else None
            adm = direct_admin or (admins[0] if admins else None)
            first_sub = (assigned_employees + assigned_interns)[0] if (assigned_employees or assigned_interns) else None
            if top: hierarchy_chain.append(QueryHandlers._member_to_item(top, db))
            if adm: hierarchy_chain.append(QueryHandlers._member_to_item(adm, db))
            if current_user: hierarchy_chain.append(QueryHandlers._member_to_item(current_user, db))
            if first_sub: hierarchy_chain.append(QueryHandlers._member_to_item(first_sub, db))

        elif user_role_norm == "admin":
            # Rule 2: Admin -> Team_Lead -> Employee / Intern
            # 1 Predecessor: Super Admin (manager of this Admin)
            manager_id = current_user.profile.reporting_manager_id if current_user and current_user.profile else None
            direct_sa = db.query(User).filter(User.id == manager_id).first() if manager_id else (super_admins[0] if super_admins else None)
            if direct_sa:
                predecessors.append(QueryHandlers._member_to_item(direct_sa, db))

            # Successors: ONLY Team Leads, Employees, and Interns under THIS Admin's branch
            my_team_leads = [
                tl for tl in team_leads 
                if tl.profile and tl.profile.reporting_manager_id == current_user.id
            ]
            my_tl_ids = [tl.id for tl in my_team_leads]
            my_employees = [
                emp for emp in employees
                if emp.profile and (emp.profile.reporting_manager_id in my_tl_ids or emp.profile.reporting_manager_id == current_user.id)
            ]
            my_interns = [
                i for i in interns 
                if i.profile and (i.profile.reporting_manager_id in my_tl_ids or i.profile.reporting_manager_id == current_user.id)
            ]

            for tl in my_team_leads:
                successors.append(QueryHandlers._member_to_item(tl, db))
            for emp in my_employees:
                successors.append(QueryHandlers._member_to_item(emp, db))
            for i in my_interns:
                successors.append(QueryHandlers._member_to_item(i, db))

            # Peers: other Admins reporting to Super Admin
            peers = [QueryHandlers._member_to_item(a, db) for a in admins if a.id != current_user.id]

            top = direct_sa or (super_admins[0] if super_admins else None)
            tl = my_team_leads[0] if my_team_leads else None
            first_sub = (my_employees + my_interns)[0] if (my_employees or my_interns) else None
            if top: hierarchy_chain.append(QueryHandlers._member_to_item(top, db))
            if current_user: hierarchy_chain.append(QueryHandlers._member_to_item(current_user, db))
            if tl: hierarchy_chain.append(QueryHandlers._member_to_item(tl, db))
            if first_sub: hierarchy_chain.append(QueryHandlers._member_to_item(first_sub, db))

        else: # super_admin
            # Rule 1: Super_Admin -> Admin -> Team_Lead -> Employee / Intern
            # Rule 4: Super_Admin -> HR
            predecessors = []
            for a in admins:
                successors.append(QueryHandlers._member_to_item(a, db))
            for h in hrs:
                successors.append(QueryHandlers._member_to_item(h, db))
            for tl in team_leads:
                successors.append(QueryHandlers._member_to_item(tl, db))
            for emp in employees:
                successors.append(QueryHandlers._member_to_item(emp, db))
            for i in interns:
                successors.append(QueryHandlers._member_to_item(i, db))

            adm = admins[0] if admins else None
            tl = team_leads[0] if team_leads else None
            first_intern = interns[0] if interns else None
            if current_user: hierarchy_chain.append(QueryHandlers._member_to_item(current_user, db))
            if adm: hierarchy_chain.append(QueryHandlers._member_to_item(adm, db))
            if tl: hierarchy_chain.append(QueryHandlers._member_to_item(tl, db))
            if first_intern: hierarchy_chain.append(QueryHandlers._member_to_item(first_intern, db))

        return {
            "user_role": user_role_norm,
            "predecessors": predecessors,
            "successors": successors,
            "peers": peers,
            "hierarchy_chain": hierarchy_chain,
        }

    @staticmethod
    def handle_get_user_profile(query: GetUserProfileQuery, db: Session) -> Dict[str, Any]:
        user = db.query(User).filter(User.id == query.user_id).first()
        if not user:
            return None

        prof = user.profile
        desig_number = ""
        desig_name = user.role.replace("_", " ").title()
        skill_set = ["ReactJS", "FastAPI", "PostgreSQL", "CQRS", "Tailwind CSS", "JavaScript", "Python"]
        full_home_address = "No. 42, Silicon Valley Avenue, T. Nagar, Chennai, Tamil Nadu 600017, India"
        photo = None
        mobile = "+91 98765 43210"
        dept = "Edutech"
        doj = date(2026, 1, 15)
        rep_name = "Sarah Jenkins"
        rep_role = "Senior Team Lead"

        if prof:
            if user.role == "intern":
                desig_number = prof.intern_id or "ING-INT-2026-0002"
                desig_name = prof.designation or "Frontend Developer Intern"
            else:
                desig_number = prof.employee_id or f"ING-EMP-2026-{user.id:04d}"
                desig_name = prof.designation or desig_name

            if prof.skills and isinstance(prof.skills, list):
                skill_set = prof.skills

            # Compose full home address
            addr_parts = [p for p in [prof.address, prof.city, prof.state, prof.country] if p]
            if addr_parts:
                full_home_address = ", ".join(addr_parts)
            elif prof.address:
                full_home_address = prof.address

            photo = prof.profile_photo
            if prof.mobile:
                mobile = prof.mobile
            if prof.department:
                dept = prof.department
            if prof.joining_date:
                doj = prof.joining_date
            if prof.reporting_manager:
                rep_name = prof.reporting_manager.full_name or prof.reporting_manager.email
                rep_role = prof.reporting_manager.profile.designation if prof.reporting_manager.profile else "Manager"

        user_role_norm = user.role.lower().replace(" ", "_")
        is_manager_role = user_role_norm not in ["intern", "employee", "team_lead", "team_leader", "teamleader"]
        
        employee_count_str = None
        successor_account_avail_str = None
        manager_succ_avail_str = None

        all_users = db.query(User).all()

        is_hr_profile = user_role_norm in ["hr", "human_resource_manager"] or (user.email or "").lower() == "hr@ingage.com"

        if is_manager_role or user_role_norm in ["team_lead", "team_leader", "teamleader"]:
            if user_role_norm in ["super_admin", "superadmin"]:
                # Rule 1 & Rule 4: Super Admin manages Admins, HRs, Team Leads, Employees, Interns
                succs = [u for u in all_users if u.id != user.id and u.role in ["admin", "hr", "team_lead", "employee", "intern", "hr_intern"]]
            elif user_role_norm == "admin":
                # Rule 2: Admin -> Team_Lead -> Employee / Intern
                succs = [u for u in all_users if u.id != user.id and u.role in ["team_lead", "employee", "intern", "hr", "hr_intern"]]
            elif is_hr_profile:
                # Rule 4: (super_admin -> hr) or (super_admin -> hr -> hr_intern) or (super_admin -> any_roles_relate_with_hr)
                # Successors align ONLY with HR-related roles (NOT with all tasks)
                succs = [
                    u for u in all_users
                    if u.id != user.id and (
                        (u.role or "").lower() in ["hr_intern", "human_resource_intern"] or
                        (u.profile and "hr intern" in (u.profile.designation or "").lower()) or
                        (u.profile and u.profile.reporting_manager_id == user.id)
                    )
                ]
            elif user_role_norm in ["team_lead", "team_leader", "teamleader"]:
                # Rule 3: Team_Lead -> Employee / Intern
                succs = [u for u in all_users if (u.role or "").lower() in ["intern", "employee"] and (u.profile and u.profile.reporting_manager_id == user.id)]
            else:
                succs = [u for u in all_users if u.id != user.id and u.role in ["intern", "employee", "team_lead"]]

            if succs:
                employee_count_str = str(len(succs))
                successor_account_avail_str = "Available"
            elif is_hr_profile:
                employee_count_str = "0"
                successor_account_avail_str = "0"
            else:
                employee_count_str = "NA"
                successor_account_avail_str = "NA"

        # Determine reporting manager
        manager_user = None
        if prof and prof.reporting_manager:
            manager_user = prof.reporting_manager
            rep_name = manager_user.full_name or manager_user.email
            rep_role = manager_user.profile.designation if (manager_user.profile and manager_user.profile.designation) else manager_user.role.replace("_", " ").title()
        elif user_role_norm == "employee":
            adm = db.query(User).filter(User.role.in_(["admin", "Admin"])).first()
            if adm:
                manager_user = adm
                rep_name = adm.full_name or adm.email
                rep_role = adm.profile.designation if (adm.profile and adm.profile.designation) else "Admin"
        elif user_role_norm == "intern":
            # Rule 3: Team_Lead -> Intern
            tl = db.query(User).filter(User.role == "team_lead").first()
            if tl:
                manager_user = tl
                rep_name = tl.full_name or tl.email
                rep_role = tl.profile.designation if (tl.profile and tl.profile.designation) else "Senior Team Lead"
        elif user_role_norm == "team_lead":
            # Rule 2: Admin -> Team_Lead
            adm = db.query(User).filter(User.role == "admin").first()
            if adm:
                manager_user = adm
                rep_name = adm.full_name or adm.email
                rep_role = adm.profile.designation if (adm.profile and adm.profile.designation) else "Engineering Director"
        elif user_role_norm in ["hr", "human_resource_manager"]:
            # Rule 4: Super_Admin -> HR (Immediate reporting manager is Super Admin)
            sa = db.query(User).filter(User.role.in_(["super_admin", "superadmin"])).first()
            if sa:
                manager_user = sa
                rep_name = sa.full_name or sa.email
                rep_role = sa.profile.designation if (sa.profile and sa.profile.designation) else "Super Admin"
        elif user_role_norm == "admin":
            # Rule 1: Super_Admin -> Admin
            sa = db.query(User).filter(User.role.in_(["super_admin", "superadmin"])).first()
            if sa:
                manager_user = sa
                rep_name = sa.full_name or sa.email
                rep_role = sa.profile.designation if (sa.profile and sa.profile.designation) else "Super Admin"
        else: # super_admin
            rep_name = "NA"
            rep_role = "NA"

        if manager_user:
            mgr_role_norm = manager_user.role.lower().replace(" ", "_")
            if mgr_role_norm in ["super_admin", "superadmin"]:
                mgr_succs = [u for u in all_users if u.id != manager_user.id and u.role in ["admin", "hr", "team_lead", "intern"]]
            elif mgr_role_norm == "admin":
                mgr_succs = [u for u in all_users if u.id != manager_user.id and u.role in ["team_lead", "intern"]]
            elif mgr_role_norm == "team_lead":
                mgr_succs = [u for u in all_users if u.profile and u.profile.reporting_manager_id == manager_user.id] or [u for u in all_users if u.role == "intern"]
            else:
                mgr_succs = [u for u in all_users if u.id != manager_user.id]

            if mgr_succs:
                manager_succ_avail_str = "Available"
            else:
                manager_succ_avail_str = "NA"
        else:
            manager_succ_avail_str = "NA"

        return {
            "photo": photo,
            "full_name": user.full_name or "Dhanush A",
            "email": user.email,
            "employee_designation_number": desig_number,
            "employee_designation_name": desig_name,
            "skill_set": skill_set,
            "full_home_address": full_home_address,
            "mobile": mobile,
            "department": dept,
            "role": user.role,
            "current_status": user.current_status or "On Duty",
            "date_of_joining": doj,
            "reporting_manager_name": rep_name,
            "reporting_manager_role": rep_role,
            "employee_count": employee_count_str,
            "successor_account_available": successor_account_avail_str,
            "manager_name": rep_name,
            "manager_successor_available": manager_succ_avail_str,
        }

    @staticmethod
    def handle_get_notifications(query: GetNotificationsQuery, db: Session) -> Dict[str, Any]:
        notifs = db.query(Notification).filter(
            Notification.user_id == query.user_id
        ).order_by(desc(Notification.created_at)).limit(query.limit).all()

        unread_count = db.query(Notification).filter(
            Notification.user_id == query.user_id,
            Notification.is_read == False
        ).count()

        items = []
        for n in notifs:
            items.append({
                "id": n.id,
                "title": n.title,
                "message": n.message,
                "task_id": n.task_id,
                "link": n.link,
                "notification_type": n.notification_type,
                "is_read": n.is_read,
                "created_at": n.created_at,
            })

        return {
            "items": items,
            "unread_count": unread_count,
        }

    @staticmethod
    def handle_get_project_analysis(query: GetProjectAnalysisQuery, db: Session) -> List[Dict[str, Any]]:
        # Rule: Except the "Intern" Designation Role, rest should be present it
        if (query.role or "").lower() == "intern":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Project Analysis Mode is restricted to higher designation roles."
            )

        today = date.today()

        # Rule: except Admin and Super Admin, rest of the users should present only their project and follows with successors users
        allowed_ids = QueryHandlers.get_user_and_successor_ids(query.user_id, query.role, db)
        if allowed_ids is None:
            projects = db.query(Project).order_by(Project.id.asc()).all()
        else:
            task_proj_ids = db.query(Task.project_id).filter(
                or_(
                    Task.id.in_(
                        db.query(TaskAssignment.task_id).filter(TaskAssignment.user_id.in_(allowed_ids))
                    ),
                    Task.assigned_by_id.in_(allowed_ids)
                )
            ).distinct()
            projects = db.query(Project).filter(
                or_(
                    Project.id.in_(task_proj_ids),
                    Project.manager_id.in_(allowed_ids)
                )
            ).order_by(Project.id.asc()).all()

        results = []

        for proj in projects:
            if allowed_ids is None:
                proj_tasks = db.query(Task).filter(Task.project_id == proj.id).all()
            else:
                assigned_task_subq = db.query(TaskAssignment.task_id).filter(
                    TaskAssignment.user_id.in_(allowed_ids)
                ).subquery()
                proj_tasks = db.query(Task).filter(
                    Task.project_id == proj.id,
                    or_(
                        Task.id.in_(assigned_task_subq),
                        Task.assigned_by_id.in_(allowed_ids)
                    )
                ).all()

            total_tasks = len(proj_tasks)
            completed_tasks = sum(1 for t in proj_tasks if t.status == "Completed")
            
            # Check overdue tasks
            overdue_tasks = sum(
                1 for t in proj_tasks
                if t.status == "Overdue" or (t.due_date and t.due_date < today and t.status != "Completed")
            )
            has_overdue = overdue_tasks > 0

            # Completion percentage: (completed / total) * 100
            completion_percentage = round((completed_tasks / total_tasks * 100), 1) if total_tasks > 0 else 0.0

            # Distinct team members assigned to tasks in this project
            task_ids = [t.id for t in proj_tasks]
            assignments = db.query(TaskAssignment).filter(TaskAssignment.task_id.in_(task_ids)).all() if task_ids else []
            assigned_user_ids = list({a.user_id for a in assignments})

            users = db.query(User).filter(User.id.in_(assigned_user_ids)).all() if assigned_user_ids else []
            if allowed_ids is not None:
                users = [u for u in users if u.id in allowed_ids]

            team_members = []
            employee_breakdown = []

            for u in users:
                profile = u.profile
                desig = profile.designation if profile and profile.designation else u.role.replace("_", " ").title()
                avatar = profile.profile_photo if profile else None
                emp_name = u.full_name or u.email.split("@")[0]

                team_members.append({
                    "id": u.id,
                    "name": emp_name,
                    "email": u.email,
                    "role": u.role,
                    "designation": desig,
                    "avatar": avatar,
                })

                # Tasks assigned to this specific employee on this project
                u_tasks = [t for t in proj_tasks if any(a.user_id == u.id for a in t.assignments)]
                u_low = sum(1 for t in u_tasks if (t.priority or "").lower() == "low")
                u_med = sum(1 for t in u_tasks if (t.priority or "").lower() == "medium")
                u_high = sum(1 for t in u_tasks if (t.priority or "").lower() in ["high", "critical"])
                u_total = len(u_tasks)
                u_completed = sum(1 for t in u_tasks if t.status == "Completed")
                u_comp_pct = round((u_completed / u_total * 100), 1) if u_total > 0 else 0.0

                employee_breakdown.append({
                    "employee_id": u.id,
                    "employee_name": emp_name,
                    "role": u.role,
                    "designation": desig,
                    "avatar": avatar,
                    "low_priority_count": u_low,
                    "medium_priority_count": u_med,
                    "high_priority_count": u_high,
                    "total_priority_count": u_total,
                    "completed_count": u_completed,
                    "completion_percentage": u_comp_pct,
                })

            # 1st Employee name in Ascending order (A -> Z)
            employee_breakdown.sort(key=lambda x: (x["employee_name"] or "").lower())
            team_members.sort(key=lambda x: (x["name"] or "").lower())

            results.append({
                "id": proj.id,
                "project_code": f"PRJ-{proj.id:02d}",
                "name": proj.name,
                "description": proj.description or "",
                "client_name": proj.client_name or "Internal",
                "department": proj.department,
                "status": proj.status,
                "start_date": str(proj.start_date),
                "end_date": str(proj.end_date),
                "total_task_count": total_tasks,
                "completed_task_count": completed_tasks,
                "overdue_task_count": overdue_tasks,
                "has_overdue": has_overdue,
                "completion_percentage": completion_percentage,
                "team_members": team_members,
                "employee_breakdown": employee_breakdown,
            })

        return results

