# System Architecture & End-to-End Flow Analysis
## Task Tracking System – Ingage Technologies

> **Stack:** React 19 + Vite · FastAPI + Python 3.13 · PostgreSQL (27 Tables) · CQRS · WebSocket · JWT Auth · 27 CSV Mirror Files

---

## Table of Contents

1. [High-Level Architectural Landscape](#1-high-level-architectural-landscape)
2. [File-to-File Flow (Frontend Component Tree)](#2-file-to-file-flow-frontend-component-tree)
3. [Frontend-to-Backend API Flow](#3-frontend-to-backend-api-flow)
4. [CQRS Execution Engine & Service-to-Service Flow](#4-cqrs-execution-engine--service-to-service-flow)
5. [Database Relational Model & Data Flow](#5-database-relational-model--data-flow)
6. [Verification & Health Audit Plan](#6-verification--health-audit-plan)

---

## 1. High-Level Architectural Landscape

The Task Tracking System is a full-stack application composed of three distinct layers:
- **React 19 SPA** frontend served via Vite on port 5173
- **FastAPI + Python 3.13** backend on port 8000 (Uvicorn + psycopg2)
- **PostgreSQL** relational database (`task_tracking_db` — 27 tables) with a CSV mirror for seeding/reporting

```mermaid
flowchart TD
    subgraph Client["Frontend (React 19 + Vite + Tailwind CSS)"]
        UI["React SPA Entry (main.jsx & App.jsx)"]
        AuthCtx["AuthContext (JWT in localStorage)"]
        Pages["Pages (Dashboard, Tasks, Team, Chat, Attendance, HR, Settings)"]
        APIClient["API Client Layer (Axios Interceptors client.js)"]
        WSClient["WebSocket Clients (Presence & Chat)"]
    end

    subgraph Server["Backend (FastAPI + Python 3.13)"]
        FastAPIMain["FastAPI Core (main.py + Lifespan Manager)"]
        Routers["API Routers (11 Modular Endpoints)"]
        CQRS["CQRS Layer (Commands & Queries)"]
        Handlers["Handler Engine (CommandHandlers, QueryHandlers, ChatHandlers)"]
        WSManager["WebSocket Gateway (ws_manager & Broadcast Channel)"]
        BackgroundServices["Background Daemons (8-Min Presence & 90-Day Retention)"]
    end

    subgraph Storage["Database Layer (PostgreSQL / task_tracking_db & CSVs)"]
        DB["PostgreSQL (task_tracking_db - 27 Tables)"]
        CSVs["CSV Mirror (task_tracking_db_csv - 27 CSV Files)"]
    end

    UI --> AuthCtx
    AuthCtx --> Pages
    Pages --> APIClient
    Pages --> WSClient
    APIClient -->|HTTP / REST JWT Bearer| Routers
    WSClient <-->|WSS Bi-directional| WSManager
    Routers --> CQRS
    CQRS --> Handlers
    Handlers -->|SQLAlchemy ORM psycopg2| DB
    WSManager -->|Live State Push| Client
    BackgroundServices -->|Periodic Execution| DB
    DB <--->|Data Ingestion / Export| CSVs
```

---

## 2. File-to-File Flow (Frontend Component Tree)

### 2.1 Bootstrapping & Routing Pipeline

1. **[index.html](file:///c:/Users/ASUS/Downloads/Ingage_Technologies/Task_Tracking_System/frontend/index.html)**  
   Root HTML document containing `<div id="root"></div>`. Loads `/src/main.jsx`.

2. **[main.jsx](file:///c:/Users/ASUS/Downloads/Ingage_Technologies/Task_Tracking_System/frontend/src/main.jsx)**  
   Mounts React 19 root into DOM. Wraps the application in `<AuthProvider>` from `AuthContext.jsx`.

3. **[AuthContext.jsx](file:///c:/Users/ASUS/Downloads/Ingage_Technologies/Task_Tracking_System/frontend/src/context/AuthContext.jsx)**  
   - Manages global session state: `user`, `token`, `isAuthenticated`, `loading`  
   - Reads existing session from `localStorage.getItem('token')` and `localStorage.getItem('user')`  
   - On initialization, verifies token freshness via `authApi.getMe()`  
   - Exposes `login()`, `logout()`, `ssoLogin()`, `refreshUser()`

4. **[App.jsx](file:///c:/Users/ASUS/Downloads/Ingage_Technologies/Task_Tracking_System/frontend/src/App.jsx)**  
   - Primary router and layout coordinator via `window.location.hash`  
   - **Auth Gate**: If `!isAuthenticated`, renders `LoginPage.jsx`  
   - **Role Guard**: Protects `#hr` route (`canAccessHR`); non-HR/Admin redirected to `#dashboard`  
   - **Shell Layout**: Renders `Navbar.jsx`, `Sidebar.jsx`, and active page in `<main>`

### 2.2 Component Hierarchy & Data Flow Map

```mermaid
graph TD
    App["App.jsx (Layout & Hash Router)"]
    App --> Navbar["Navbar.jsx"]
    Navbar --> NotificationDrawer["NotificationDrawer.jsx"]
    Navbar --> BrandLogo["BrandLogo.jsx"]
    App --> Sidebar["Sidebar.jsx"]

    App --> LoginPage["LoginPage.jsx (Split-Screen Login & Quick Pills)"]
    App --> DashboardPage["DashboardPage.jsx"]
    DashboardPage --> AttendanceWidget["Dynamic Attendance Punch (Check-in/Lunch/Break/Check-out)"]
    DashboardPage --> TaskCountAnalysis["Task Count Analytics (Scoped to Role User)"]
    DashboardPage --> TeamMembersList["Team Availability & Successor Accounts"]

    App --> TasksPage["TasksPage.jsx"]
    TasksPage --> TaskToolbar["Toolbar: Total Assigned/Received Pill + All Tasks Toggle + Filters"]
    TasksPage --> TabularView["Tabular View (Multi-factor Sorting + Repeating Task IDs)"]
    TasksPage --> BoardView["Board Kanban View (Backlog, In Progress, Review, Completed, Overdue)"]
    TasksPage --> AnalysisView["Project Analysis Mode (Completion & Progress Bar)"]
    TasksPage --> TaskModal["TaskModal.jsx (Create Task & Multi-assign)"]
    TasksPage --> TaskDetailModal["TaskDetailModal.jsx (Progress & Status)"]
    TasksPage --> GroupMembersPopup["Group Task Allocated Members Popup (A to Z)"]

    App --> TeamPage["TeamPage.jsx (Strict Branch Isolation & 1st Successor Popups)"]
    App --> ChatPage["ChatPage.jsx (1-on-1 Direct Chat & Group Conversations + WS)"]
    App --> AttendancePage["AttendancePage.jsx (My Attendance Pagination & Team Attendance)"]
    App --> InternRecordsPage["InternRecordsPage.jsx (Marksheets & Student Documentation)"]
    App --> SettingsPage["SettingsPage.jsx (Profile, Password Change & System Preferences)"]
```

> **Note:** All pages except `LoginPage.jsx` require authentication. The HR page additionally requires the `canAccessHR` role check (HR or Admin only).

---

## 3. Frontend-to-Backend API Flow

All frontend network communication flows through [`client.js`](file:///c:/Users/ASUS/Downloads/Ingage_Technologies/Task_Tracking_System/frontend/src/api/client.js) using an Axios instance configured with `baseURL = '/api'`.

### 3.1 Request & Response Lifecycle

1. **Outgoing Interceptor**: Injects `Authorization: Bearer <token>` into every request from `localStorage.getItem('token')`.
2. **Response Interceptor**: Catches `401 Unauthorized` responses → clears storage → forces redirect to `/login`.
3. **Backend Middleware**: FastAPI validates CORS origins; processes requests through `get_current_user` dependency injection in [`security.py`](file:///c:/Users/ASUS/Downloads/Ingage_Technologies/Task_Tracking_System/backend/app/core/security.py) (JWT decode + DB user lookup).

### 3.2 Modular API Routing Map

| Domain | Frontend API Object | Backend Router | CQRS Operation | Primary Responsibility |
|:---|:---|:---|:---|:---|
| **Auth** | `authApi` | `auth.py` | Direct Query / JWT | Login, SSO role bypass, session verify (`/auth/me`), password hashing |
| **Dashboard** | `dashboardApi` | `dashboard.py` | `GetDashboardStatsQuery` | Role-scoped work count analytics, duty status, recent tasks, availability |
| **Tasks** | `tasksApi` | `tasks.py` | `GetTasksQuery`, `CreateTaskCommand`, `UpdateTaskStatusCommand` | Paginated task list, Kanban board, task creation, multi-assignee |
| **Projects** | `projectsApi` | `projects.py` | Direct Query | Project list, dept filtering, employee workload breakdown & completion metrics |
| **Team** | `teamApi` | `team.py` | `GetHierarchyQuery`, `CreateUserCommand` | Branch-isolated hierarchy, 1st predecessor/successor discovery |
| **Attendance** | `attendanceApi` | `attendance.py` | Direct Transaction | Dynamic punch (check-in/lunch/break/check-out), pagination, Saturday setting |
| **Chat** | `chatApi` | `chat.py` | `SendMessageCommand`, `GetMessagesQuery` | Real-time 1-on-1 & group chat, member rosters, message delivery |
| **Notifications** | `notificationsApi` | `notifications.py` | `GetNotificationsQuery`, `MarkReadCommand` | Notification drawer, unread count, mark read, 90-day retention audit |
| **Intern Docs** | `internRecordsApi` | `intern_records.py` | Direct CRUD | Marksheets (10th, 12th, college), address & emergency contact |
| **Presence** | `presenceApi` | `presence.py` | Background Service | On Duty / Off Duty toggle, 8-min periodic availability scan |

---

## 4. CQRS Execution Engine & Service-to-Service Flow

The backend adheres strictly to **CQRS (Command Query Responsibility Segregation)**:

- **Commands** (`backend/app/cqrs/commands/`) — Mutate state, validate business constraints, dispatch domain notifications
- **Queries** (`backend/app/cqrs/queries/`) — Read-only operations with filtering, pagination, and branch scoping
- **Handlers** (`backend/app/cqrs/handlers/`) — Business logic fully decoupled from HTTP transport

### 4.1 Task Creation Sequence (Full CQRS Flow)

```mermaid
sequenceDiagram
    autonumber
    actor User as Client (Frontend)
    participant Router as FastAPI Router
    participant CQRS as CQRS Command / Query
    participant Handler as Handler Layer
    participant Broadcaster as NotificationBroadcaster / WSManager
    participant DB as PostgreSQL (task_tracking_db)

    User->>Router: POST /api/tasks (Create Task Payload)
    Router->>CQRS: Instantiate CreateTaskCommand
    CQRS->>Handler: CommandHandlers.handle_create_task(cmd, db)
    Handler->>DB: INSERT INTO tasks & task_assignments
    DB-->>Handler: Return persisted Task Entity
    Handler->>Broadcaster: NotificationBroadcaster.dispatch_task_assigned_event()
    Broadcaster->>DB: INSERT INTO notifications
    Broadcaster-->>User: Push live notification over WebSocket
    Handler-->>Router: Task Entity
    Router-->>User: 201 Created (TaskResponse JSON)
```

### 4.2 Background Daemons & Services

Two continuous background workers run inside the FastAPI asyncio lifespan in [`main.py`](file:///c:/Users/ASUS/Downloads/Ingage_Technologies/Task_Tracking_System/backend/main.py):

**1. 8-Minute Periodic Presence Service** (`periodic_8min_presence_service`)
- Sleeps for 480 seconds between runs
- Evaluates active employee availability; broadcasts state changes over `/api/ws/presence`
- Records run status in `service_execution_states` and `service_execution_logs`

**2. 90-Day Notification Retention Service** (`notification_cleanup_background_scheduler`)
- Checks every 60 seconds if current time is Sunday 23:59 or Monday 06:00 AM
- Scans and deletes read/unread notifications older than 90 days
- Updates `service_execution_states`; appends audit record to `service_execution_logs`

---

## 5. Database Relational Model & Data Flow

The database consists of **27 relational tables** in PostgreSQL (`task_tracking_db`), mirrored in `task_tracking_db_csv/` as 27 CSV files.

### 5.1 Entity Relationship Diagram

```mermaid
erDiagram
    users ||--o| user_profiles : "has 1:1"
    users ||--o{ task_assignments : "is assigned"
    users ||--o{ tasks : "creates (assigned_by)"
    users ||--o{ notifications : "receives"
    users ||--o{ attendance_records : "logs daily"
    users ||--o{ chat_members : "participates in"
    users ||--o{ chat_messages : "sends"
    users ||--o{ intern_records : "manages/creates"
    users ||--o{ projects : "manages"

    projects ||--o{ tasks : "contains"
    tasks ||--o{ task_assignments : "allocates"
    tasks ||--o{ notifications : "triggers"

    chat_conversations ||--o{ chat_members : "has members"
    chat_conversations ||--o{ chat_messages : "contains messages"

    daily_attendances ||--o{ attendance_sessions : "tracks"
    daily_attendances ||--o{ attendance_breaks : "records"
    daily_attendances ||--o{ attendance_corrections : "requests"
```

### 5.2 Role Hierarchy & Branch Scoping Rules

The system enforces strict reporting-tree isolation. Each role can only see data within its own branch:

| Role | Predecessor View | Successor View | Can Assign Tasks |
|:---|:---|:---|:---:|
| Super Admin | None | All Admins | ✅ |
| Admin | Super Admin | Own Team Leads only | ✅ |
| Team Lead | Assigned Admin | Own Interns only | ✅ |
| Intern | Team Lead | Peer interns | ❌ |
| HR | Super Admin | HR-scoped users | ✅ |

```
Super Admin (Elizabeth Reed – ID 3)
  ├── Admin 1 (Alex Morgan – ID 4)
  │     └── Team Lead (Sarah Jenkins – ID 5)
  │           ├── Intern 1 (Priya Sharma – ID 6)
  │           ├── Intern 2 (Karthik Subramanian – ID 11)
  │           ├── Intern 3 (Ananya Rao – ID 12)
  │           └── Intern 4 (Dhanush – ID 2)
  ├── Admin 2 (Dhanush A – ID 1) → Isolated branch (cannot see Admin 1's branch)
  └── HR (Meera Raman – ID 10) → Independent branch (excludes engineering interns)
```

> **DB Access Policy:** The `task_tracking_db` PostgreSQL database is **read-only** for architecture audit purposes.  
> Seed credentials: password `admin123` for all 9 users.  
> Connection string: `postgresql+psycopg2://postgres:root@localhost:5432/task_tracking_db`

---

## 6. Verification & Health Audit Plan

### 6.1 Automated Verification Commands

```powershell
# 1. Verify complete branch isolation and hierarchy rules across all 5 roles
cd backend; .\venv\Scripts\python.exe test_full_verification.py

# 2. Verify attendance punch state transitions and Saturday toggle
cd backend; .\venv\Scripts\python.exe test_attendance_verify.py

# 3. Verify notification 90-day retention scheduler and audit logs
cd backend; .\venv\Scripts\python.exe test_notification_cleanup.py

# 4. Verify frontend build compilation with zero errors
npm.cmd --prefix frontend run build
```

### 6.2 Manual Verification Checklist

- [ ] **Login Flow** — Open `http://localhost:5173/`; verify "Remember my workspace" is **unchecked** by default
- [ ] **Tasks Page Toolbar** — Confirm Total Assigned / Received pill renders left of "All Tasks" for all roles
- [ ] **Dashboard Task Count Analysis** — Super Admin shows 4 tasks; Team Lead shows 13 tasks; Intern Priya shows 11 tasks
- [ ] **Attendance Punch Button** — Dynamic state: Check-in → Lunch → Break → Check-out
- [ ] **Branch Isolation** — Logged as Admin 2 (`dhanusha130703@gmail.com`), cannot see Admin 1's Team Leads or Interns
- [ ] **Multi-assignee Tasks** — Create task with 3 assignees; assignee count badge appears; clicking badge shows all 3 names
- [ ] **WebSocket Notifications** — Assign a task; real-time notification appears without refresh in target user's drawer
- [ ] **All Tasks Toggle** — Pressed: distinct tasks in descending Task ID order. Unpressed: individual assignee rows (repeating Task IDs are fine)

---

*Generated by Antigravity · Ingage Technologies Task Tracking System · November 2026*
