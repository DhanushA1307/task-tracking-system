import logging
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import NullPool
from app.core.config import settings

logger = logging.getLogger(__name__)

# Cloud PostgreSQL (Supabase / Neon / Railway) requires SSL
connect_args = {}
if any(host in settings.DATABASE_URL for host in ["supabase", "neon.tech", "railway.app"]):
    connect_args["sslmode"] = "require"

# On Vercel Serverless, avoid holding idle pool slots against Supabase Session Pooler
is_vercel = bool(os.getenv("VERCEL") or os.getenv("VERCEL_ENV"))

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

engine = create_engine(settings.DATABASE_URL, **engine_kwargs)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
