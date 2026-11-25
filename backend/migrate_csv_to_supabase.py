"""Migrate schema and CSV data from task_tracking_db_csv into Supabase PostgreSQL."""

import ast
import csv
import json
import os
import sys
from decimal import Decimal
from pathlib import Path

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    Integer,
    JSON,
    MetaData,
    Numeric,
    Time,
    create_engine,
    text,
)

BACKEND_DIR = Path(__file__).resolve().parent
REPO_ROOT = BACKEND_DIR.parent
CSV_DIR = REPO_ROOT / "task_tracking_db_csv"

# Ensure backend app imports resolve cleanly
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import settings  # noqa: E402
from app.core.database import Base  # noqa: E402
import app.models.domain  # noqa: E402, F401  # Register all ORM models


LOCAL_SCHEMA_URL = os.getenv(
    "LOCAL_SCHEMA_URL",
    "postgresql+psycopg2://postgres:root@localhost:5432/task_tracking_db",
)


def parse_csv_value(raw_val: str, col):
    """Convert a CSV string value into the appropriate Python value for SQLAlchemy."""
    col_type = col.type
    if raw_val == "" or raw_val is None:
        if not col.nullable and not isinstance(
            col_type, (Integer, Boolean, Numeric, Float, Date, Time, DateTime, JSON)
        ):
            return ""
        return None

    if isinstance(col_type, Boolean):
        low = raw_val.strip().lower()
        if low in ("true", "t", "1", "yes"):
            return True
        if low in ("false", "f", "0", "no"):
            return False
        return bool(raw_val)

    if isinstance(col_type, Integer):
        return int(float(raw_val))

    if isinstance(col_type, Numeric):
        return Decimal(raw_val)

    if isinstance(col_type, Float):
        return float(raw_val)

    if isinstance(col_type, JSON):
        try:
            return json.loads(raw_val)
        except json.JSONDecodeError:
            # Handle Python literal repr strings saved in CSV (e.g., "['React', 'SQL']")
            val = ast.literal_eval(raw_val)
            # Round-trip through JSON to ensure strict JSON compatibility
            return json.loads(json.dumps(val))

    return raw_val


def build_target_metadata() -> MetaData:
    """Reflect full 27-table schema from local PostgreSQL (read-only), or fallback to ORM Base."""
    try:
        local_engine = create_engine(LOCAL_SCHEMA_URL, pool_pre_ping=True)
        with local_engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        meta = MetaData()
        meta.reflect(bind=local_engine)
        print(f"[SCHEMA] Reflected {len(meta.sorted_tables)} tables (read-only) from local task_tracking_db.")
        return meta
    except Exception as exc:
        print(f"[SCHEMA] Local DB unavailable ({exc}); using SQLAlchemy ORM Base.metadata ({len(Base.metadata.sorted_tables)} tables).")
        return Base.metadata


def migrate_csv_to_supabase(target_url: str | None = None) -> None:
    db_url = target_url or settings.DATABASE_URL
    if "localhost" in db_url or "127.0.0.1" in db_url:
        raise RuntimeError(
            "Target DATABASE_URL still points to localhost. Please configure Supabase DATABASE_URL in backend/.env."
        )

    connect_args = {"sslmode": "require"} if "supabase" in db_url else {}
    supa_engine = create_engine(db_url, pool_pre_ping=True, connect_args=connect_args)

    meta = build_target_metadata()
    print("[SUPABASE] Creating missing tables and constraints...")
    meta.create_all(bind=supa_engine)

    total_inserted = 0
    mismatches = []

    with supa_engine.begin() as conn:
        for table in meta.sorted_tables:
            csv_path = CSV_DIR / f"{table.name}.csv"
            if not csv_path.exists():
                print(f"  [SKIP] {table.name}: no CSV file found")
                continue

            with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
                reader = csv.DictReader(f)
                raw_rows = list(reader)

            existing_count = conn.execute(
                text(f'SELECT COUNT(*) FROM "{table.name}"')
            ).scalar_one()

            if existing_count > 0:
                print(
                    f"  [EXISTS] {table.name:28s} supa_rows={existing_count:4d} csv_rows={len(raw_rows):4d} (skipped)"
                )
                continue

            if raw_rows:
                col_map = {c.name: c for c in table.columns}
                parsed_rows = []
                for row in raw_rows:
                    parsed = {}
                    for col_name, col in col_map.items():
                        if col_name in row:
                            parsed[col_name] = parse_csv_value(row[col_name], col)
                    parsed_rows.append(parsed)

                conn.execute(table.insert(), parsed_rows)
                total_inserted += len(parsed_rows)

            # Reset PostgreSQL sequence to MAX(id) if an 'id' column exists
            if "id" in table.c:
                conn.execute(
                    text(
                        """
                        SELECT setval(
                            pg_get_serial_sequence(:tbl, 'id'),
                            COALESCE((SELECT MAX(id) FROM """ + f'"{table.name}"' + """), 1),
                            EXISTS (SELECT 1 FROM """ + f'"{table.name}"' + """)
                        )
                        """
                    ),
                    {"tbl": table.name},
                )

            final_count = conn.execute(
                text(f'SELECT COUNT(*) FROM "{table.name}"')
            ).scalar_one()
            status = "OK" if final_count == len(raw_rows) else "MISMATCH"
            if status != "OK":
                mismatches.append((table.name, len(raw_rows), final_count))
            print(f"  [{status}]   {table.name:28s} imported={final_count:4d}/{len(raw_rows):4d}")

    print(f"\n[DONE] Total rows inserted into Supabase: {total_inserted}")
    if mismatches:
        raise RuntimeError(f"Row count mismatches detected: {mismatches}")


if __name__ == "__main__":
    migrate_csv_to_supabase()
