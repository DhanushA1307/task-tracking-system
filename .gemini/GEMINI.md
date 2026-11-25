# Ingage Task Tracking System — End-to-End Architecture & Summarized Context

> **File**: `.gemini/GEMINI.md`  
> **Project**: Ingage Task Tracking System (CQRS Enterprise Portal)  
> **Last Synchronized**: November 25, 2026  
> **Scope**: Complete audit of `backend/`, `frontend/`, `task_tracking_db_csv/`, and `vercel.json` deployment flow

---

## 1. Executive Summary & Tech Stack

The **Ingage Task Tracking System** is a full-stack enterprise operations portal designed for hierarchical task delegation, project tracking, real-time presence monitoring, team chat, daily attendance punching, multi-tier leave approval, and HR intern lifecycle management.

| Layer | Technology & Pattern | Details |
| :--- | :--- | :--- |
| **Architecture** | **CQRS** (Command Query Responsibility Segregation) | Separates mutating commands (`app/cqrs/commands` + `command_handlers.py` / `chat_handlers.py`) from scoped read queries (`app/cqrs/queries` + `query_handlers.py`). |
| **Backend API** | **FastAPI** (Python 3.13, Uvicorn ASGI) | 12 modular REST/WebSocket/SSE routers mounted under `/api`. |
| **Database & ORM** | **PostgreSQL** + **SQLAlchemy ORM** | 30 relational tables in `public` schema; supports Supabase Session Pooler (Vercel Serverless `NullPool`) with automatic fallback to local PostgreSQL in dev. |
| **Security & Auth** | **OAuth2 JWT Bearer** + Argon2/Bcrypt | HS256 JWT tokens (`24h` expiry), role-based access control, self-service password change, and branch-scoped subordinate password resets. |
| **Real-Time** | **WebSockets** + **SSE** | Live WebSocket duty presence (`/api/ws/presence` + 8-min heartbeat) and SSE push notifications (`/api/notifications/stream`). |
| **Frontend UI** | **React 19** + **Vite** + **Tailwind CSS v4** | Hash-routed SPA (`#dashboard`, `#tasks`, `#team`, `#chat`, `#attendance`, `#leave`, `#hr`, `#settings`) with Axios JWT interceptors. |
| **Deployment** | **Vercel Multi-Service** (`vercel.json`) | Single project hosting `backend` (`fastapi` under `/api/(.*)`) and `frontend` (`vite` under `/(.*)`). |

---

## 2. End-to-End Document & Request Flow Structure

Every user interaction flows end-to-end through the following unified pipeline:

```mermaid
flowchart LR
    UI["Frontend UI\n(React 19 + Tailwind)"] -->|"Axios /api/* + Bearer JWT\n(client.js)"| Proxy["Routing Layer\nVite Proxy (dev) / Vercel Rewrites (prod)"]
    Proxy -->|"Routes /api/*"| API["FastAPI Routers\n(backend/app/api/*.py)"]
    API -->|"Depends(get_current_user)\nJWT Validation"| Sec["Security Layer\n(core/security.py)"]
    API -->|"Write State"| Cmd["CQRS Commands\n(command_handlers.py / chat_handlers.py)"]
    API -->|"Read State"| Qry["CQRS Queries\n(query_handlers.py)"]
    Cmd -->|"SQLAlchemy ORM"| DB[("PostgreSQL / Supabase\n(30 public tables)")]
    Qry -->|"Scoped Hierarchy SQL"| DB
    Cmd -->|"Side Effects"| RT["Real-Time Engine\nSSE Broadcaster & WS Manager"]
    RT -->|"Push Updates"| UI
    DB -.->|"export_db.py"| CSV["CSV Snapshot\n(task_tracking_db_csv/*.csv)"]
```

### Step-by-Step End-to-End Lifecycle
1. **Authentication & Session Bootstrap**:
   - User logs in at `LoginPage.jsx` via standard email/password (`POST /api/auth/login`) or quick SSO (`POST /api/auth/sso-login`).
   - `AuthContext.jsx` stores the JWT `access_token` and user payload in `localStorage`, validates session via `GET /api/auth/me`, and opens persistent real-time connections (SSE for notifications, WebSocket for presence).
   - **Auto-Redirect**: HR Managers (`hr` / `human_resource_manager`) land directly on `#hr`; all other roles land on `#dashboard`.
2. **Routing & Role Guarding**:
   - `App.jsx` & `Sidebar.jsx` enforce client-side view protection (e.g., `#hr` is strictly locked to `super_admin`, `admin`, and `hr`; unauthorized hash access redirects to `#dashboard`).
   - Backend endpoints independently enforce strict RBAC via `get_current_user` and handler-level branch checks.
3. **CQRS Execution**:
   - **Writes**: FastAPI router builds a typed Command (`CreateTaskCommand`, `CreateUserCommand`, `BulkCreateUsersCommand`, `SendChatMessageCommand`, etc.), validates hierarchy permissions, commits to PostgreSQL, and triggers SSE/WebSocket events.
   - **Reads**: Router dispatches a Query (`GetDashboardStatsQuery`, `GetTasksQuery`, `GetHierarchyQuery`, etc.) which computes hierarchical visibility (`super_admin` -> `admin` -> `team_lead` -> `employee` / `intern`) and returns Pydantic-serialized DTOs.
4. **Data Snapshot & Portability**:
   - `export_db.py` (at repo root) connects to PostgreSQL `public` schema and exports all tables into `task_tracking_db_csv/*.csv` for backup, auditing, and migration.

---

## 3. Organizational Hierarchy & Role Governance

```mermaid
flowchart TD
    SA["Super Admin (Elizabeth Reed)\n[VP of Engineering & Technology]"]
    ADM1["Admin (Alex Morgan)\n[Engineering Director]"]
    ADM2["Admin (Dhanush A)\n[Engineering Admin]"]
    HR["HR Manager (Meera Raman)\n[Human Resource Manager]"]
    TL["Team Lead (Sarah Jenkins)\n[Senior Technical Lead]"]
    EMP["Employees (5 Accounts)\n[Rohan, Sneha, Vikram, Pooja, Arjun]"]
    INT["Interns (4 Accounts)\n[Dhanush, Priya, Karthik, Ananya]"]
    HRI["HR Intern (Optional Successor)"]

    SA --> ADM1
    SA --> ADM2
    SA --> HR
    ADM1 --> TL
    ADM1 -->|"Direct Report"| EMP5["Arjun Das (DevOps)"]
    TL --> EMP
    TL --> INT
    HR -.-> HRI
```

### Core Access & Hierarchy Rules
1. **Six Active Roles**: `super_admin`, `admin`, `hr` (`human_resource_manager`), `team_lead`, `employee`, `intern`.
2. **Scoped Visibility**:
   - `super_admin`: Global organization visibility across all branches, projects, tasks, leave policies, and attendance.
   - `admin`: Branch-scoped visibility (`Admin -> Team Lead -> Employee / Intern` under their reporting tree), plus HR Intern Records access and Team Attendance control.
   - `team_lead`: Manages assigned `employee` and `intern` direct reports.
   - `employee`: Full-time staff (`staff_category="Employee"`, `ING-EMP-*`); views assigned tasks, collaborates with peer employees, marks attendance, applies for leave, and chats across company.
   - `intern`: Views tasks assigned to them (`Tasks Assigned to Me`), higher reporting officers on Team page, marks attendance, and applies for leave (Project Analysis & Successor Task views are hidden).
   - `hr`: Manages `InternRecord` lifecycle (`#hr`). **HR Task Isolation**: HR successors align strictly with `(super_admin -> hr)` or `hr_intern`; engineering interns are excluded from HR task allocation lists and HR task views.
3. **Password Management Policy**:
   - Any authenticated user can update their own password via **Settings > Security** (`POST /api/auth/change-password`).
   - Subordinate password reset (`POST /api/team/users/{user_id}/reset-password`) is strictly branch-scoped: `super_admin` -> all non-super-admins; `admin` -> non-admin subordinates in branch; `team_lead` -> reporting interns/employees; `hr` -> HR interns/direct reports.

---

## 4. Backend Workflow Inventory (`backend/`)

### A. API Routers (`backend/app/api/`, mounted under `/api`)
| Router Module | Prefix | Key Endpoints & Capabilities |
| :--- | :--- | :--- |
| **`auth.py`** | `/auth` | `POST /login`, `POST /sso-login` (supports `super_admin`, `admin`, `hr`, `team_lead`, `employee`, `intern`), `POST /logout`, `GET /me`, `POST /change-password`. |
| **`dashboard.py`** | `/dashboard` | `GET /stats` — Task KPIs, priority breakdown, live WebSocket availability list (sorted Available-first), hierarchy flow metadata. |
| **`tasks.py`** | `/tasks` | `GET /` (paginated, sortable, scoped tabular tasks), `GET /board` (Kanban columns), `GET /{id}`, `POST /`, `PATCH /{id}/status`, `PUT /{id}`, `DELETE /{id}`. |
| **`projects.py`** | `/projects` | `GET /`, `GET /analysis` (completion %, overdue & contributor metrics), `POST /`. |
| **`team.py`** | `/team` | `GET /hierarchy`, `GET /assignees`, `POST /users` (single creation), `POST /users/bulk` (atomic multi-employee creation), `POST /users/{id}/reset-password`. |
| **`chat.py`** | `/chat` | `GET /users`, `GET /conversations` (reverse-chronological), `POST /conversations/direct`, `POST /conversations/group`, `GET/POST /conversations/{id}/messages`, `POST /.../leave`, `POST /.../members`. |
| **`attendance.py`** | `/attendance` | `GET /today`, `POST /mark` (`check_in` 9:30–11:30 AM, `lunch` 12:00–4:30 PM, `break` 5:00–6:15 PM, `check_out` 6:30–8:30 PM; auto-calculates net hours), `GET /my`, `GET /team` (Admin/Super Admin), `POST /saturday-toggle`. |
| **`leaves.py`** | `/leaves` | `GET/PUT /policies` (Super Admin sets limits for 6 categories/modes), `POST /apply` (enforces limits & auto-routes to 3 officers: Super Admin, Branch Admin, Higher Officer + SSE notifications), `GET /my`, `GET /incoming`, `PATCH /{id}/decision`. |
| **`intern_records.py`** | `/intern-records` | HR/Admin CRUD for intern documentation (`10th/12th/college` marksheets, distinct mobile vs emergency validation, auto-provisions intern portal user), `POST /generate-sample`. |
| **`notifications.py`** | `/notifications` | `GET /stream` (SSE push), `GET /`, `PATCH /{id}/read`, `POST /read-all`, `GET /service/status`, `POST /service/execute`, `POST /service/toggle`, `GET /service/logs`. |
| **`presence.py`** | `/` | `WS /ws/presence` (JWT-authenticated WebSocket presence tracking), `POST/GET /service-check` & `/presence/service-check`. |
| **`settings.py`** | `/settings` | `GET/PUT /profile` (photo, designation fields locked for non-admins, skills, address, mobile). |

### B. Background Services (`backend/main.py` Lifespan — Active in Non-Serverless Mode)
1. **Startup Schema & Seed**: Runs `Base.metadata.create_all(bind=engine)` and executes `seed_database()` if `users` table is empty.
2. **8-Minute Presence Service** (`periodic_8min_presence_service`): Runs every `480s`, invoking `ws_manager.run_periodic_service_cycle()` to audit active sockets and broadcast `"presence_service_cycle"`.
3. **90-Day Notification Retention Cleanup** (`notification_cleanup_background_scheduler`): Checks every `60s`. Runs every **Sunday** (with **Monday 6:00 AM** catch-up if missed/disabled), deleting notifications older than 90 days and logging to `service_execution_states` and `service_execution_logs`.

### C. Database Connection Strategy (`core/config.py` & `core/database.py`)
- Loads `backend/.env` locally (ignored in Git; Vercel uses project environment variables).
- Normalizes `postgres://` -> `postgresql+psycopg2://` and enforces `sslmode=require` for Supabase/Neon/Railway.
- **Vercel Serverless**: Uses `NullPool` to avoid exhausting Supabase Session Pooler connection slots.
- **Local Fallback**: If remote `DATABASE_URL` fails locally, automatically falls back to `LOCAL_DATABASE_URL` (`postgresql+psycopg2://postgres:root@localhost:5432/task_tracking_db`).

---

## 5. Frontend Workflow Inventory (`frontend/src/`)

| Module / Page | Hash / Route | Core Functionality |
| :--- | :--- | :--- |
| **`LoginPage.jsx`** | Unauthenticated | Split-screen portal sign-in (`email`, `password`, workspace remember toggle); connects via `AuthContext.login()`. |
| **`Navbar.jsx`** | Global Top Bar | Brand logo, active tab indicator, notification bell opening `NotificationDrawer.jsx` (live SSE stream), and profile menu. |
| **`Sidebar.jsx`** | Global Left Nav | Collapsible navigation (`01` Dashboard, `02` My Task, `03` Team Members, `04` Chat, `05` Attendance, `06` Leave, `07` HR [Admin/Super Admin/HR only], `08` Settings). |
| **`DashboardPage.jsx`** | `#dashboard` | Task status/priority analytics, quick daily Attendance punch card (with Saturday working toggle for Admins), Weekly Timesheet summary, and 8-Min Team Availability leaderboard (Available users sorted on top; hidden for Interns). |
| **`TasksPage.jsx`** | `#tasks` | **3 Views**: Tabular Grid (scoped by `Tasks I Allocated` / `Successor Tasks` / `Tasks Assigned to Me`, sortable, paginated), Kanban Board (status transitions), and Project Analysis (`ProjectAnalysisModal.jsx`). Uses `TaskModal.jsx` & `TaskDetailModal.jsx`. |
| **`TeamPage.jsx`** | `#team` | Organizational chart (predecessor, peers, successors), `+ Add Member` modal (`admin`, `hr`, `team_lead`, `employee`, `intern`), `+ Add Multiple Employees` bulk creation modal, and branch-scoped `Reset PW` modal. |
| **`ChatPage.jsx`** | `#chat` | Full messaging workspace: filter (`All`, `Direct`, `Group`), 1-on-1 direct chat launcher, multi-member group creation, live online badges, leave/add-members controls, chronological messages inside reverse-chronological thread list. |
| **`AttendancePage.jsx`** | `#attendance` | **My Attendance**: Dynamic daily session punch (`Check-in`, `Lunch`, `Break`, `Check-out`) + paginated personal ledger. **Team Attendance** (Admin/Super Admin only): Date-filtered A–Z roster + Saturday Office Working toggle. |
| **`LeavePage.jsx`** | `#leave` | **Apply Leave**: 3 categories (`regular`, `emergency_leave`, `sick_leave`) x 4 duration modes (`single_day`, `half_day`, `consecutive_days`, `selective_days`) with live quota checks & 3-tier routing preview. **Incoming Requests**: Approval/rejection workflow for officers. **Leave Policies**: Customizable limits (Super Admin only). |
| **`InternRecordsPage.jsx`** | `#hr` | Restricted to Super Admin, Admin, HR. Manage intern education/contact/marksheet records, distinct phone validation, auto-provision login accounts, and CSV/JSON export. |
| **`SettingsPage.jsx`** | `#settings` | **Profile Tab** (photo, locked designation fields for non-admins, skills, address, mobile, hierarchy counts) & **Security Tab** (self-service password change). |

---

## 6. Database Schema & Exported CSV Snapshot (`task_tracking_db_csv/`)

All **30 PostgreSQL `public` tables** were exported directly from the backend database into `task_tracking_db_csv/` using SQLAlchemy inspection (mirroring `export_db.py`).

### Populated Tables Snapshot (Current Row Counts)
| CSV File (`task_tracking_db_csv/`) | Rows | Purpose |
| :--- | :---: | :--- |
| `users.csv` | **14** | User credentials, roles (`super_admin`, `admin`, `hr`, `team_lead`, `employee`, `intern`), duty status |
| `user_profiles.csv` | **14** | Staff category (`Employee`/`Intern`), IDs (`ING-EMP-*`, `ING-HR-*`, `ING-INT-*`), manager links, skills |
| `projects.csv` | **5** | Company projects across departments (`Ingage`, `Edutech`, `Rezov`) |
| `tasks.csv` | **23** | Task records, priorities, due dates, progress %, submission/review notes |
| `task_assignments.csv` | **38** | Task-to-User assignment mappings |
| `notifications.csv` | **61** | Task, leave, and system notification payloads (subject to 90-day cleanup) |
| `intern_records.csv` | **4** | HR intern education & contact dossiers |
| `attendance_records.csv` | **217** | Historical & daily check-in/lunch/break/check-out records and total hours |
| `attendance_policies.csv` | **1** | Shift timings, grace period, and break deduction configuration |
| `attendance_sessions.csv` | **2** | Granular session heartbeat logs |
| `attendance_settings.csv` | **1** | `is_saturday_working` toggle state |
| `daily_attendances.csv` | **3** | Consolidated daily attendance summaries |
| `chat_conversations.csv` | **5** | Direct and group chat threads with last message preview |
| `chat_members.csv` | **12** | Active/left group membership and roles |
| `chat_messages.csv` | **15** | Chronological chat and system announcement messages |
| `leave_policies.csv` | **6** | Super Admin limits (`single_day`, `half_day`, `consecutive_days`, `selective_days`, `emergency_leave`, `sick_leave`) |
| `leave_requests.csv` | **2** | Submitted leave applications & status |
| `leave_recipients.csv` | **2** | 3-tier officer routing & decision records |
| `service_execution_states.csv` | **1** | 90-day notification cleanup service state |
| `service_execution_logs.csv` | **11** | Audit history of retention cleanup runs |
| `user_invitations.csv` | **1** | Onboarding invitation token log |

*Schema-ready tables currently at `0` rows*: `attendance_breaks.csv`, `attendance_corrections.csv`, `daily_work_updates.csv`, `project_documents.csv`, `project_links.csv`, `project_members.csv`, `task_activities.csv`, `user_education.csv`, `user_leaves.csv`.

---

## 7. Seeded Directory & Credentials Summary

All pre-seeded accounts use default password **`admin123`** (fallback dev verification also accepts `password`, `root`, `123456`).

| ID | Role | Full Name | Email | Employee / Intern ID | Designation | Reporting To |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| **3** | `super_admin` | Elizabeth Reed | `superadmin@ingage.com` | `ING-EMP-2024-0001` | VP of Engineering & Technology | *Top Level* |
| **4** | `admin` | Alex Morgan | `admin@ingage.com` | `ING-EMP-2025-0012` | Engineering Director | Elizabeth Reed |
| **1** | `admin` | Dhanush A | `dhanusha130703@gmail.com` | `ING-EMP-2025-0010` | Engineering Admin | Elizabeth Reed |
| **10** | `hr` | Meera Raman | `hr@ingage.com` | `ING-HR-2025-0008` | Human Resource Manager | Elizabeth Reed |
| **5** | `team_lead` | Sarah Jenkins | `teamlead@ingage.com` | `ING-EMP-2025-0045` | Senior Technical Lead | Alex Morgan |
| **13** | `employee` | Rohan Verma | `rohan.verma@ingage.com` | `ING-EMP-2025-0021` | Employee (Software Engineer) | Sarah Jenkins |
| **14** | `employee` | Sneha Patel | `sneha.patel@ingage.com` | `ING-EMP-2025-0022` | Employee (Frontend Developer) | Sarah Jenkins |
| **15** | `employee` | Vikram Malhotra | `vikram.malhotra@ingage.com` | `ING-EMP-2025-0023` | Employee (Backend Developer) | Sarah Jenkins |
| **16** | `employee` | Pooja Hegde | `pooja.hegde@ingage.com` | `ING-EMP-2025-0024` | Employee (QA Engineer) | Sarah Jenkins |
| **17** | `employee` | Arjun Das | `arjun.das@ingage.com` | `ING-EMP-2025-0025` | Employee (DevOps Engineer) | Alex Morgan |
| **2** | `intern` | Dhanush A | `drickcurve123@gmail.com` | `INT-0002` | Frontend Developer Intern | Sarah Jenkins |
| **6** | `intern` | Priya Sharma | `priya.sharma@ingage.com` | `ING-INT-2026-0005` | Full Stack Developer Intern | Sarah Jenkins |
| **11** | `intern` | Karthik Subramanian | `karthik.s@ingage.com` | `ING-INT-2026-0006` | Backend Developer Intern | Sarah Jenkins |
| **12** | `intern` | Ananya Rao | `ananya.rao@ingage.com` | `ING-INT-2026-0007` | Frontend Developer Intern | Sarah Jenkins |

---

## 8. Execution, Export & Deployment Runbook

### Local Development
- **Backend** (uses `backend/venv`):
  ```powershell
  cd backend
  $env:PYTHONPATH='.'
  .\venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
  ```
- **Frontend** (`vite.config.js` proxies `/api/*` -> `http://localhost:8000` with `ws: true`):
  ```powershell
  cd frontend
  npm run dev
  ```
- **Export Database Snapshot to CSV** (root `export_db.py`):
  ```powershell
  python export_db.py
  ```

### Vercel Multi-Service Deployment (`vercel.json`)
- **Service Topology**:
  - `backend` (`root: "backend"`, `framework: "fastapi"`) served via rewrite `/api/(.*) -> backend`.
  - `frontend` (`root: "frontend"`, `framework: "vite"`) served via catch-all rewrite `/(.*) -> frontend`.
- **Supabase Cloud Connection Note**:
  - Direct Supabase host (`db.<project-ref>.supabase.co:5432`) is IPv6-only and fails on IPv4 networks and Vercel Serverless.
  - Use the **Supabase IPv4 Session Pooler** URI (`aws-0-<region>.pooler.supabase.com:5432` or `:6543`) with username `postgres.<project-ref>` and `?sslmode=require`, configured in Vercel Environment Variables (`DATABASE_URL`, `SECRET_KEY`, `BACKEND_CORS_ORIGINS`).
