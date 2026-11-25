from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
import os

from app.core.config import settings
from app.api import auth, dashboard, tasks, team, settings as settings_api, notifications, projects, intern_records, presence, chat, attendance, leaves
from app.core.websocket_manager import ws_manager
from app.services.notification_cleanup_service import notification_cleanup_background_scheduler
from app.seed import seed_database

async def periodic_8min_presence_service():
    """8-minute periodic background service checking and broadcasting employee availability."""
    while True:
        try:
            await asyncio.sleep(480) # 8 minutes = 480 seconds
            await ws_manager.run_periodic_service_cycle()
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"[8-Min Presence Service] Error: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    is_serverless = bool(os.getenv("VERCEL") or os.getenv("VERCEL_ENV"))

    # Ensure database schema exists and seed only when database is empty
    try:
        from app.core.database import engine, Base, SessionLocal
        from app.models.domain import User
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        try:
            has_users = db.query(User.id).first() is not None
        finally:
            db.close()
        if not has_users:
            seed_database()
    except Exception as e:
        print(f"Startup seed notice: {e}")

    background_tasks = []
    if not is_serverless:
        # 1. Start 8-minute periodic employee presence service
        background_tasks.append(asyncio.create_task(periodic_8min_presence_service()))
        # 2. Start 90-day notification retention cleanup service (Every Sunday & Monday 6AM catch-up)
        background_tasks.append(asyncio.create_task(notification_cleanup_background_scheduler(check_interval_seconds=60)))

    yield

    for task in background_tasks:
        task.cancel()
    if background_tasks:
        try:
            await asyncio.gather(*background_tasks, return_exceptions=True)
        except Exception:
            pass

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Task Tracking System API with CQRS Architecture",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for frontend Vite development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In development allow all for easy testing
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(dashboard.router, prefix=settings.API_V1_STR)
app.include_router(tasks.router, prefix=settings.API_V1_STR)
app.include_router(projects.router, prefix=settings.API_V1_STR)
app.include_router(team.router, prefix=settings.API_V1_STR)
app.include_router(settings_api.router, prefix=settings.API_V1_STR)
app.include_router(notifications.router, prefix=settings.API_V1_STR)
app.include_router(intern_records.router, prefix=settings.API_V1_STR)
app.include_router(presence.router, prefix=settings.API_V1_STR)
app.include_router(chat.router, prefix=settings.API_V1_STR)
app.include_router(attendance.router, prefix=settings.API_V1_STR)
app.include_router(leaves.router, prefix=settings.API_V1_STR)

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "Task Tracking System API",
        "database": "PostgreSQL",
        "pattern": "CQRS (Command Query Responsibility Segregation)"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)

