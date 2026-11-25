# Task Tracking System

An enterprise-grade, hierarchy-driven **Task Tracking System** designed and built for Ingage Technologies, adhering to strict corporate role hierarchies, CQRS architectural pattern, and visual design standards extracted from `theme-colour.png`.

---

## 🚀 Tech Stack

- **Frontend**: ReactJS (Vite, Tailwind CSS, Lucide-React Icons)
- **Backend**: Python (FastAPI) architected with **CQRS** (Command Query Responsibility Segregation)
- **Database**: PostgreSQL (Running on PostgreSQL 18, database: `task_tracking_db`)
- **Theme & Branding**: Olive / Lime Brand Green (`#65a30d`), light green tinted cards (`#f4faed`), and crisp layout matching `theme-colour.png`.

---

## 🏛️ Organizational Hierarchy

The system strictly enforces the four designated tiers:

```
👑 Super Admin  (VP of Engineering & Technology)
     │
     ▼
🛡️ Admin        (Engineering Director / Admin)
     │
     ▼
👔 Team Lead    (Senior Technical Lead)
     │
     ▼
🎓 Intern       (Frontend Developer Intern / Full Stack Intern)
```

---

## 📱 Application Flow & Features

### 1. Main Navigation Layout
- **Company Logo** on the **far left edge** (`BrandLogo`: "ingage" with custom green dot and brand typography).
- **Notifications** on the **last 2nd edge of right side** (Interactive bell with unread badge counter, slide-in popover, mark-as-read, and quick task links).
- **Profile** on the **far right edge** (User avatar, full name, role badge, quick role switcher for testing all 4 hierarchy roles, profile link, and sign-out).

### 2. "Log In" Page (Split-Screen / Two Sides)
- **Side 1 (Left Side)**: Primary Form Context
  - Input: **Email**
  - Input: **Password**
  - **Submit** button (brand green `#65a30d`)
  - Form validation, error feedback, and remember-me toggle.
- **Side 2 (Right Side)**: Single Sign-On (SSO) Context
  - **SSO Button**: Single click sign-in that redirects directly to the **Dashboard Page** for the designated user (defaults to Intern Dhanush).
  - Quick 1-Click Role Switcher for instant login into any of the 4 roles:
    - 🎓 **Intern**: `drickcurve123@gmail.com` (Dhanush A - Frontend Intern)
    - 👔 **Team Lead**: `teamlead@ingage.com` (Sarah Jenkins - Senior Lead)
    - 🛡️ **Admin**: `admin@ingage.com` (Alex Morgan - Engineering Director)
    - 👑 **Super Admin**: `superadmin@ingage.com` (Elizabeth Reed - VP of Engineering)

### 3. Page 1: Dashboard (`/dashboard`)
- **For Intern Designation (and all roles)**:
  - **Work Count: Completed** (count of verified completed tasks, progress %, completion badge).
  - **Work Count: In Progress** (active tasks underway with progress tracking).
  - **Work Count: Overdue** (prominently highlighted alert card with warning badges).
  - **Total Tasks** & Overall Completion Rate.
- **Workspace Overview (Matches `theme-colour.png`)**:
  - Welcome Banner: *"Welcome back, {User Name}"* with *"Go to My Tasks"* action.
  - **Total Weekly Hours** card (`24.00h`, Overtime `0`).
  - **Current Status** card (`On Duty` / `Off Duty`).
  - **Time Clock** with Department Selector (`Edutech`, `Ingage`, `Rezov`).
  - **Schedule** & **Time Sheets** quick cards.
  - Recent tasks under user's responsibility.

### 4. Page 2: My Task (`/tasks`)
- **View Mode Toggle**:
  - 📌 **Board Mode (Kanban)**:
    - 5 Columns: `Backlog / To Do`, `In Progress`, `Under Review`, `Completed`, `Overdue`.
    - Priority pills (Critical, High, Medium, Low), due date badges, progress bars, and one-click quick move (`Done`).
  - 📋 **Tabular Mode (Data Table with Pagination)**:
    - Columns: `Task ID`, `Title & Details`, `Project`, `Status`, `Priority`, `Due Date`, `Progress`, `Actions`.
    - **Pagination Format**:
      - "Showing 1 to 5 of 9 tasks"
      - Rows per page selector: `5`, `10`, `20`
      - Page navigation: `Previous`, `1`, `2`, `Next`.
- Filters: Search bar, Status filter dropdown, Priority filter dropdown.
- Modals:
  - **Create Task Modal**: Add task title, description, priority, status, due date, estimated hours.
  - **Task Detail & Status Update Drawer**: Update status, adjust progress slider %, submit completion notes, and view manager review comments.

### 5. Page 3: Team Members (`/team`)
- **For Intern Designation**:
  - Specifically showcases their **Higher Designation position Person**:
    - **Direct Team Lead**: `Sarah Jenkins` (Senior Technical Lead)
    - **Department Admin**: `Alex Morgan` (Engineering Director)
    - **Super Admin**: `Elizabeth Reed` (VP of Engineering & Technology)
  - Full details: Name, Role, Designation ID, Email, Phone, Campus Office, and Competency Skills.
  - Visual **Hierarchy Chain of Command** (Super Admin ➔ Admin ➔ Team Lead ➔ Intern).
  - Peers section showing fellow interns.
- **For Team Leads & Admins**:
  - Shows Predecessors (Superiors) AND Successors (Reporting subordinates/interns).

### 6. Page 4: Settings (`/settings`)
- Displays and edits the **7 mandatory attributes** for the user:
  1. 📷 **Photo** (Profile picture preview and image URL modifier)
  2. 👤 **Full Name** (e.g., `Dhanush A`)
  3. ✉️ **mail-Id Address** (e.g., `drickcurve123@gmail.com`)
  4. 🆔 **Employee Designation Number** (e.g., `INT-0002` / `ING-INT-2026-0002`)
  5. 💼 **Employee Designation Name** (e.g., `Frontend Developer Intern`)
  6. 🛠️ **Skill set** (Interactive tag pills with Add and Remove capabilities)
  7. 🏠 **Full Home Address** (Full street address, city, state, postal code, country)
- Mobile number, Department, Date of Joining, and Reporting Manager.
- Instant save directly to PostgreSQL database via CQRS handler.

---

## ⚙️ CQRS Backend Architecture

The FastAPI backend cleanly separates Command operations (writes) from Query operations (reads):

```
backend/app/
├── cqrs/
│   ├── commands/             # Write side (Command DTOs)
│   │   ├── task_commands.py  # CreateTaskCommand, UpdateTaskStatusCommand, etc.
│   │   ├── user_commands.py  # LoginCommand, SSOLoginCommand, UpdateUserProfileCommand
│   │   └── notification_commands.py
│   ├── queries/              # Read side (Query DTOs)
│   │   ├── dashboard_queries.py # GetDashboardStatsQuery (work counts)
│   │   ├── task_queries.py      # GetTasksQuery, GetBoardTasksQuery
│   │   ├── team_queries.py      # GetHierarchyQuery (predecessor/successor)
│   │   └── user_queries.py      # GetUserProfileQuery (7 profile attributes)
│   └── handlers/             # Business Logic & Persistence
│       ├── command_handlers.py # Transactional writers to PostgreSQL
│       └── query_handlers.py   # High-performance read projections
```

---

## 🏃 Running the Application

### 1. Backend (FastAPI + PostgreSQL)
```powershell
cd backend
# Activate virtual environment
.\venv\Scripts\Activate.ps1
# Set python path and start uvicorn
$env:PYTHONPATH='.'
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```
API Documentation (Swagger UI): `http://127.0.0.1:8000/docs`

### 2. Frontend (ReactJS + Vite)
```powershell
cd frontend
npm.cmd run dev
```
Access the application at: `http://localhost:5173/`

### 3. Demo Credentials (All passwords: `admin123`)
| Designation | Name | Email | Direct SSO |
|-------------|------|-------|------------|
| **Intern** | Dhanush A | `drickcurve123@gmail.com` | One-Click Default |
| **Team Lead** | Sarah Jenkins | `teamlead@ingage.com` | One-Click Lead |
| **Admin** | Alex Morgan | `admin@ingage.com` | One-Click Admin |
| **Super Admin** | Elizabeth Reed | `superadmin@ingage.com` | One-Click Super Admin |

# task-tracking-system
