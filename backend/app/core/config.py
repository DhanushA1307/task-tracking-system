import os

class Settings:
    PROJECT_NAME: str = "Task Tracking System"
    API_V1_STR: str = "/api"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "ingage-task-tracking-secret-key-2026-super-secure")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 # 24 hours
    
    # PostgreSQL configuration using psycopg2 driver
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg2://postgres:root@localhost:5432/task_tracking_db"
    )
    
    # CORS
    BACKEND_CORS_ORIGINS: list = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://localhost:8000",
    ]

settings = Settings()
