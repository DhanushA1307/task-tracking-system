import os
from pathlib import Path
from dotenv import load_dotenv

# Load backend/.env automatically in local development
_BACKEND_DIR = Path(__file__).resolve().parents[2]
load_dotenv(_BACKEND_DIR / ".env")


class Settings:
    PROJECT_NAME: str = os.getenv("PROJECT_NAME", "Task Tracking System")
    API_V1_STR: str = os.getenv("API_V1_STR", "/api")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "ingage-task-tracking-secret-key-2026-super-secure")
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 24)))  # 24 hours

    # PostgreSQL configuration using psycopg2 driver
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg2://postgres:root@localhost:5432/task_tracking_db"
    )

    # Fix: Neon/Supabase/Render provide "postgres://" but SQLAlchemy needs "postgresql+psycopg2://"
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg2://", 1)

    # CORS — includes local dev origins, comma-separated BACKEND_CORS_ORIGINS, and Vercel domains
    _extra_cors = [
        o.strip() for o in os.getenv("BACKEND_CORS_ORIGINS", "").split(",") if o.strip()
    ]
    BACKEND_CORS_ORIGINS: list = list(dict.fromkeys([
        origin for origin in [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:3000",
            "http://localhost:8000",
            os.getenv("FRONTEND_URL", ""),
            f"https://{os.getenv('VERCEL_URL', '')}" if os.getenv("VERCEL_URL") else "",
            *_extra_cors,
        ] if origin
    ]))

settings = Settings()
