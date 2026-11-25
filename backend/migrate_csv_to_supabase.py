"""Sync schema and CSV data from task_tracking_db_csv into Supabase PostgreSQL.

Supports full idempotent upsert synchronization:
- Creates any missing tables/constraints
- Inserts new rows from CSVs
- Updates existing rows when any column value changed
- Resets PostgreSQL ID sequences
- Optional `--prune` flag deletes rows removed from CSVs (in reverse FK order)
"""

import argparse
import ast
import csv
import json
import os
import sys
from datetime import date, datetime, time, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

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
    and_,
    create_engine,
    select,
    text,
)
from sqlalchemy.dialects.postgresql import insert as pg_insert

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


def parse_csv_value(raw_val: str, col) -> Any:
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

    if isinstance(col_type, DateTime):
        return datetime.fromisoformat(raw_val.strip().replace("Z", "+00:00"))

    if isinstance(col_type, Date):
        return date.fromisoformat(raw_val.strip()[:10])

    if isinstance(col_type, Time):
        return time.fromisoformat(raw_val.strip())

    if isinstance(col_type, JSON):
        try:
            return json.loads(raw_val)
        except json.JSONDecodeError:
            # Handle Python literal repr strings saved in CSV (e.g., "['React', 'SQL']")
            val = ast.literal_eval(raw_val)
            # Round-trip through JSON to ensure strict JSON compatibility
            return json.loads(json.dumps(val))

    return raw_val


def _values_equal(csv_val: Any, db_val: Any) -> bool:
    """Compare a parsed CSV value against a PostgreSQL column value accurately."""
    if csv_val is None and db_val is None:
        return True
    if csv_val is None or db_val is None:
        return False

    if isinstance(csv_val, datetime) and isinstance(db_val, datetime):
        c_dt = csv_val.astimezone(timezone.utc) if csv_val.tzinfo else csv_val.replace(tzinfo=timezone.utc)
        d_dt = db_val.astimezone(timezone.utc) if db_val.tzinfo else db_val.replace(tzinfo=timezone.utc)
        return c_dt == d_dt

    if isinstance(csv_val, Decimal) or isinstance(db_val, Decimal):
        return Decimal(str(csv_val)) == Decimal(str(db_val))

    if isinstance(csv_val, (float, int)) and isinstance(db_val, (float, int)) and not isinstance(csv_val, bool):
        return float(csv_val) == float(db_val)

    return csv_val == db_val


def _row_changed(csv_row: dict[str, Any], db_row: dict[str, Any]) -> bool:
    """Return True if any CSV column differs from the stored database row."""
    for col_name, c_val in csv_row.items():
        if not _values_equal(c_val, db_row.get(col_name)):
            return True
    return False


def build_target_metadata(supa_engine) -> MetaData:
    """Reflect full schema from local PostgreSQL, Supabase, or ORM Base fallback."""
    try:
        local_engine = create_engine(LOCAL_SCHEMA_URL, pool_pre_ping=True)
        with local_engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        meta = MetaData()
        meta.reflect(bind=local_engine)
        print(f"[SCHEMA] Reflected {len(meta.sorted_tables)} tables (read-only) from local task_tracking_db.")
        return meta
    except Exception as exc:
        print(f"[SCHEMA] Local DB unavailable ({exc}); checking ORM Base.metadata ({len(Base.metadata.sorted_tables)} tables).")
        Base.metadata.create_all(bind=supa_engine)
        supa_meta = MetaData()
        supa_meta.reflect(bind=supa_engine)
        return supa_meta if len(supa_meta.sorted_tables) >= len(Base.metadata.sorted_tables) else Base.metadata


def migrate_csv_to_supabase(target_url: str | None = None, prune: bool = False) -> None:
    db_url = target_url or settings.DATABASE_URL
    if "localhost" in db_url or "127.0.0.1" in db_url:
        raise RuntimeError(
            "Target DATABASE_URL still points to localhost. Please configure Supabase DATABASE_URL in backend/.env."
        )

    connect_args = {"sslmode": "require"} if "supabase" in db_url else {}
    supa_engine = create_engine(db_url, pool_pre_ping=True, connect_args=connect_args)

    meta = build_target_metadata(supa_engine)
    print("[SUPABASE] Ensuring all tables and constraints exist...")
    meta.create_all(bind=supa_engine)

    total_inserted = 0
    total_updated = 0
    total_deleted = 0
    mismatches = []

    with supa_engine.begin() as conn:
        parsed_by_table: dict[str, tuple[list[dict[str, Any]], list[str]]] = {}

        # 1. Insert new rows and update modified rows in topological (parent -> child) order
        for table in meta.sorted_tables:
            csv_path = CSV_DIR / f"{table.name}.csv"
            if not csv_path.exists():
                print(f"  [SKIP] {table.name}: no CSV file found")
                continue

            with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
                reader = csv.DictReader(f)
                raw_rows = list(reader)

            pks = [c.name for c in table.primary_key.columns]
            col_map = {c.name: c for c in table.columns}

            parsed_rows = []
            for row in raw_rows:
                parsed = {
                    col_name: parse_csv_value(row[col_name], col)
                    for col_name, col in col_map.items()
                    if col_name in row
                }
                parsed_rows.append(parsed)

            parsed_by_table[table.name] = (parsed_rows, pks)

            inserted = 0
            updated = 0

            if pks and parsed_rows:
                existing_rows = conn.execute(select(table)).mappings().all()
                existing_by_pk = {
                    tuple(r[k] for k in pks): dict(r)
                    for r in existing_rows
                }

                rows_to_upsert = []
                for row in parsed_rows:
                    pk_key = tuple(row[k] for k in pks)
                    if pk_key not in existing_by_pk:
                        rows_to_upsert.append(row)
                        inserted += 1
                    elif _row_changed(row, existing_by_pk[pk_key]):
                        rows_to_upsert.append(row)
                        updated += 1

                if rows_to_upsert:
                    non_pk_cols = [c.name for c in table.columns if c.name not in pks]
                    stmt = pg_insert(table).values(rows_to_upsert)
                    if non_pk_cols:
                        stmt = stmt.on_conflict_do_update(
                            index_elements=pks,
                            set_={col_name: getattr(stmt.excluded, col_name) for col_name in non_pk_cols},
                        )
                    else:
                        stmt = stmt.on_conflict_do_nothing(index_elements=pks)
                    conn.execute(stmt)

            elif parsed_rows:
                # Table without PK fallback: only populate if empty
                existing_count = conn.execute(
                    text(f'SELECT COUNT(*) FROM "{table.name}"')
                ).scalar_one()
                if existing_count == 0:
                    conn.execute(table.insert(), parsed_rows)
                    inserted = len(parsed_rows)

            total_inserted += inserted
            total_updated += updated

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
            status = "OK" if final_count >= len(parsed_rows) else "MISMATCH"
            if status != "OK":
                mismatches.append((table.name, len(parsed_rows), final_count))
            print(
                f"  [{status}] {table.name:28s} csv={len(parsed_rows):4d} "
                f"supa={final_count:4d} inserted={inserted:3d} updated={updated:3d}"
            )

        # 2. Optional prune mode: remove rows missing from CSVs in reverse FK order
        if prune:
            for table in reversed(meta.sorted_tables):
                if table.name not in parsed_by_table:
                    continue
                parsed_rows, pks = parsed_by_table[table.name]
                if not pks:
                    continue
                csv_pk_set = {tuple(r[k] for k in pks) for r in parsed_rows}
                db_rows = conn.execute(select(*[table.c[k] for k in pks])).all()
                stale_pks = [tuple(r) for r in db_rows if tuple(r) not in csv_pk_set]
                for pk_vals in stale_pks:
                    cond = and_(*[table.c[k] == v for k, v in zip(pks, pk_vals)])
                    conn.execute(table.delete().where(cond))
                    total_deleted += 1
                if stale_pks:
                    print(f"  [PRUNE] {table.name:28s} deleted={len(stale_pks)}")

    print(
        f"\n[DONE] Supabase sync complete — inserted={total_inserted}, "
        f"updated={total_updated}, deleted={total_deleted}"
    )
    if mismatches:
        raise RuntimeError(f"Row count mismatches detected: {mismatches}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sync task_tracking_db_csv into Supabase.")
    parser.add_argument(
        "--prune",
        action="store_true",
        help="Also delete rows in Supabase whose primary keys are not present in CSVs.",
    )
    args = parser.parse_args()
    migrate_csv_to_supabase(prune=args.prune)
