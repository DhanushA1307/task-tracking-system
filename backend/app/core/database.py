import logging
import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import NullPool
from app.core.config import settings

logger = logging.getLogger(__name__)

LOCAL_FALLBACK_URL = os.getenv(
    "LOCAL_DATABASE_URL",
    "postgresql+psycopg2://postgres:root@localhost:5432/task_tracking_db",
)

# On Vercel Serverless, avoid holding idle pool slots against Supabase Session Pooler
is_vercel = bool(os.getenv("VERCEL") or os.getenv("VERCEL_ENV"))


def _build_engine(db_url: str):
    connect_args = {}
    if any(host in db_url for host in ["supabase", "neon.tech", "railway.app"]):
        connect_args["sslmode"] = "require"

    engine_kwargs = {
        "pool_pre_ping": True,
        "echo": False,
        "connect_args": connect_args,
    }
    if is_vercel:
        engine_kwargs["poolclass"] = NullPool
    else:
        engine_kwargs["pool_size"] = 5
        engine_kwargs["max_overflow"] = 10

    return create_engine(db_url, **engine_kwargs)


engine = _build_engine(settings.DATABASE_URL)

# If remote/Supabase credentials fail in local dev, fall back automatically to local PostgreSQL
if not is_vercel and "localhost" not in settings.DATABASE_URL and "127.0.0.1" not in settings.DATABASE_URL:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:
        logger.warning(f"Primary DATABASE_URL failed ({exc}); falling back to local PostgreSQL.")
        fallback_engine = _build_engine(LOCAL_FALLBACK_URL)
        try:
            with fallback_engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            engine.dispose()
            engine = fallback_engine
        except Exception:
            pass

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
