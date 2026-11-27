"""Import CSV files from task_tracking_db_csv/ into Supabase PostgreSQL.

Reads credentials automatically from backend/.env:
- DATABASE_URL or PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE
- Supports both Supabase IPv4 Pooler (port 5432 or 6543) and direct connections
- Topologically sorts tables to respect Foreign Key constraints
- Accurately converts CSV types (integers, floats, dates, timestamps, booleans, JSON)
- Resets PostgreSQL ID sequences (setval) to avoid primary key conflicts

Usage:
    python import_supabase_db.py
    python import_supabase_db.py --replace
    python import_supabase_db.py --password "YOUR_SUPABASE_PASSWORD"
    python import_supabase_db.py --url "postgresql://postgres.xxx:pwd@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require"
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
from typing import Any, Dict, List, Optional, Set, Tuple

# 1. Load backend/.env
REPO_ROOT = Path(__file__).resolve().parent
BACKEND_DIR = REPO_ROOT / "backend"
ENV_PATH = BACKEND_DIR / ".env"

if not ENV_PATH.exists():
    ENV_PATH = REPO_ROOT / ".env"

if ENV_PATH.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(ENV_PATH, override=True)
    except ImportError:
        # Fallback rudimentary parser if python-dotenv is not installed
        with open(ENV_PATH, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    val = val.strip().strip('"').strip("'")
                    os.environ.setdefault(key.strip(), val)

DEFAULT_CSV_DIR = REPO_ROOT / "task_tracking_db_csv"

# Add backend directory to sys.path so app models/config can be optionally leveraged
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def parse_args():
    parser = argparse.ArgumentParser(description="Import CSV data into Supabase PostgreSQL")
    parser.add_argument("--url", help="Full Supabase PostgreSQL connection URL")
    parser.add_argument("--host", default=None)
    parser.add_argument("--port", type=int, default=int(os.getenv("PGPORT", "5432")))
    parser.add_argument("--user", default=os.getenv("PGUSER", "postgres.zqqqczikmeupsrjukcug"))
    parser.add_argument("--password", default=None)
    parser.add_argument("--dbname", default=os.getenv("PGDATABASE", "postgres"))
    parser.add_argument("--csv-dir", default=str(DEFAULT_CSV_DIR), help="Directory containing CSV files")
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Truncate/clear target tables before importing (in reverse foreign key order)",
    )
    parser.add_argument(
        "--upsert",
        action="store_true",
        default=True,
        help="Perform ON CONFLICT DO UPDATE on primary keys (default behavior)",
    )
    args = parser.parse_args()
    args.host_explicitly_set = bool(args.host)
    args.password_explicitly_set = bool(args.password)
    if not args.host:
        args.host = os.getenv("PGHOST", "aws-0-ap-northeast-1.pooler.supabase.com")
    if not args.password:
        args.password = os.getenv("PGPASSWORD", "Task_Ingage")
    return args


def get_db_connection(args):
    """Establishes connection using psycopg (v3), psycopg2, or SQLAlchemy."""
    # If user explicitly passed --host or --url, honor that. Otherwise use DATABASE_URL from .env if present.
    conn_url = args.url
    if not conn_url and not args.host_explicitly_set:
        conn_url = os.getenv("DATABASE_URL")

    # If DATABASE_URL points to db.<project>.supabase.co, rewrite host to IPv4 Pooler to avoid IPv6 getaddrinfo failure
    if conn_url and "db." in conn_url and ".supabase.co" in conn_url:
        import re
        match = re.search(r"db\.([a-zA-Z0-9]+)\.supabase\.co", conn_url)
        if match:
            project_ref = match.group(1)
            # Pooler format: user is postgres.<ref>, host is aws-0-ap-northeast-1.pooler.supabase.com
            print(f"[INFO] Auto-adjusting IPv6 direct Supabase host to IPv4 connection pooler for project '{project_ref}'...")
            conn_url = re.sub(r"postgresql://([^:]+):([^@]+)@db\.[^:]+:5432/(.*)",
                              rf"postgresql://postgres.{project_ref}:\2@aws-0-ap-northeast-1.pooler.supabase.com:5432/\3",
                              conn_url)

    # If user explicitly passed --password on CLI, substitute it into conn_url
    if conn_url and args.password_explicitly_set:
        import urllib.parse
        encoded_pw = urllib.parse.quote_plus(args.password)
        import re
        conn_url = re.sub(r"(postgresql(?:\+psycopg2)?://[^:]+:)([^@]+)(@.+)", rf"\g<1>{encoded_pw}\g<3>", conn_url)
        if "sslmode" not in conn_url:
            delimiter = "&" if "?" in conn_url else "?"
            conn_url = f"{conn_url}{delimiter}sslmode=require"

    print(f"[1/5] Connecting to Supabase...")
    if conn_url:
        # Mask password in console printout
        masked = conn_url
        if "@" in masked and ":" in masked:
            user_part, rest = masked.split("@", 1)
            scheme_user = user_part.split(":", 2)
            if len(scheme_user) >= 3:
                masked = f"{scheme_user[0]}:{scheme_user[1]}:***@{rest}"
        print(f"      Connection URL: {masked}")
    else:
        print(f"      Host: {args.host}:{args.port}")
        print(f"      User: {args.user}")
        print(f"      DB:   {args.dbname}")

    # Method A: Try psycopg (v3)
    try:
        import psycopg
        if conn_url:
            return psycopg.connect(conn_url, connect_timeout=15), conn_url
        conn = psycopg.connect(
            host=args.host,
            port=args.port,
            user=args.user,
            password=args.password,
            dbname=args.dbname,
            sslmode="require",
            connect_timeout=15,
        )
        return conn, f"postgresql://{args.user}:{args.password}@{args.host}:{args.port}/{args.dbname}?sslmode=require"
    except ImportError:
        pass
    except Exception as exc:
        _handle_connection_error(exc, args.host)

    # Method B: Try psycopg2
    try:
        import psycopg2
        if conn_url:
            # psycopg2 needs standard postgresql://
            clean_url = conn_url.replace("postgresql+psycopg2://", "postgresql://")
            return psycopg2.connect(clean_url, connect_timeout=15), conn_url
        conn = psycopg2.connect(
            host=args.host,
            port=args.port,
            user=args.user,
            password=args.password,
            dbname=args.dbname,
            sslmode="require",
            connect_timeout=15,
        )
        return conn, f"postgresql://{args.user}:{args.password}@{args.host}:{args.port}/{args.dbname}?sslmode=require"
    except ImportError:
        pass
    except Exception as exc:
        _handle_connection_error(exc, args.host)

    print("\n[ERROR] Neither 'psycopg' nor 'psycopg2' is installed in this Python environment.")
    print("Please install one using: pip install psycopg[binary] or pip install psycopg2-binary")
    sys.exit(1)


def _handle_connection_error(exc: Exception, host: str = ""):
    print(f"\n[ERROR] Connection failed: {exc}")
    err_str = str(exc).lower()
    if "failed to resolve host" in err_str or "getaddrinfo failed" in err_str:
        if "supabase.co" in host or "supabase.co" in err_str:
            print("\n--> REASON: Direct 'db.<project>.supabase.co' only has IPv6 (AAAA) records and fails on IPv4 networks.")
            print("    To fix, update backend/.env to use the Supabase IPv4 Pooler host:")
            print("    Host:     aws-0-ap-northeast-1.pooler.supabase.com")
            print("    Port:     5432  (Session pooler) or 6543 (Transaction pooler)")
            print("    Username: postgres.zqqqczikmeupsrjukcug")
            print("    Or pass --host aws-0-ap-northeast-1.pooler.supabase.com --user postgres.zqqqczikmeupsrjukcug\n")
    elif "password authentication failed" in err_str:
        print("\n--> REASON: Password rejected by Supabase.")
        print("    1. Verify or reset your database password in Supabase:")
        print("       https://supabase.com/dashboard -> Project Settings -> Database -> Reset Database Password")
        print("    2. Update PGPASSWORD / DATABASE_URL in backend/.env, or run with:")
        print('       python import_supabase_db.py --password "YOUR_NEW_PASSWORD"')
        print('       python import_supabase_db.py --password "YOUR_NEW_PASSWORD" --replace  (to clean and re-import)\n')
    elif "timeout" in err_str:
        print("\n--> REASON: Network connection timed out.")
        print("    Ensure you are using the Supabase IPv4 connection pooler host:")
        print("    aws-0-ap-northeast-1.pooler.supabase.com on port 5432 or 6543\n")
    sys.exit(1)


def get_table_metadata(cursor, schema="public"):
    """Fetch all public table columns, data types, primary keys, and foreign keys."""
    # 1. Fetch tables
    cursor.execute(
        """
        SELECT tablename
        FROM pg_catalog.pg_tables
        WHERE schemaname = %s
        ORDER BY tablename
        """,
        (schema,),
    )
    table_names = [row[0] for row in cursor.fetchall()]

    # 2. Fetch columns and data types
    cursor.execute(
        """
        SELECT table_name, column_name, data_type, udt_name, is_nullable
        FROM information_schema.columns
        WHERE table_schema = %s
        """,
        (schema,),
    )
    col_info = {}
    for t_name, c_name, d_type, udt, is_null in cursor.fetchall():
        col_info.setdefault(t_name, {})[c_name] = {
            "data_type": d_type.lower(),
            "udt_name": udt.lower(),
            "nullable": is_null.upper() == "YES",
        }

    # 3. Fetch Primary Keys
    cursor.execute(
        """
        SELECT tc.table_name, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema = %s
        ORDER BY kcu.ordinal_position
        """,
        (schema,),
    )
    pk_info = {}
    for t_name, c_name in cursor.fetchall():
        pk_info.setdefault(t_name, []).append(c_name)

    # 4. Fetch Foreign Key Dependencies (child -> parent)
    cursor.execute(
        """
        SELECT child.relname, parent.relname
        FROM pg_constraint AS fk
        JOIN pg_class AS child ON child.oid = fk.conrelid
        JOIN pg_namespace AS child_schema ON child_schema.oid = child.relnamespace
        JOIN pg_class AS parent ON parent.oid = fk.confrelid
        JOIN pg_namespace AS parent_schema ON parent_schema.oid = parent.relnamespace
        WHERE fk.contype = 'f'
          AND child_schema.nspname = %s
          AND parent_schema.nspname = %s
        """,
        (schema, schema),
    )
    fk_deps: Dict[str, Set[str]] = {t: set() for t in table_names}
    for child, parent in cursor.fetchall():
        if child != parent and child in fk_deps:
            fk_deps[child].add(parent)

    return table_names, col_info, pk_info, fk_deps


def topological_sort(table_names: List[str], fk_deps: Dict[str, Set[str]]) -> List[str]:
    """Sorts tables in parent -> child dependency order for insertion."""
    deps = {t: set(fk_deps.get(t, [])) for t in table_names}
    ordered = []

    while deps:
        ready = sorted([t for t, parents in deps.items() if not parents])
        if not ready:
            # Circular FK fallback: break cycle by taking table with fewest dependencies
            ready = [min(deps.keys(), key=lambda t: len(deps[t]))]
        for t in ready:
            ordered.append(t)
            deps.pop(t, None)
        for parents in deps.values():
            parents.difference_update(ready)

    return ordered


def parse_cell(raw_val: str, col_meta: Dict[str, Any]) -> Any:
    """Type-casts raw CSV string into appropriate Python / PostgreSQL data types."""
    if raw_val is None or raw_val == "":
        return None

    dt = col_meta.get("data_type", "")
    udt = col_meta.get("udt_name", "")

    # Boolean
    if "bool" in dt or "bool" in udt:
        low = raw_val.strip().lower()
        if low in ("true", "t", "1", "yes"):
            return True
        if low in ("false", "f", "0", "no"):
            return False
        return bool(raw_val)

    # Integer
    if any(k in dt or k in udt for k in ("int", "serial", "bigint", "smallint")):
        try:
            return int(float(raw_val.strip()))
        except ValueError:
            return None

    # Floating point / Numeric
    if any(k in dt or k in udt for k in ("numeric", "decimal", "real", "double")):
        try:
            return float(raw_val.strip())
        except ValueError:
            return None

    # JSON / JSONB
    if "json" in dt or "json" in udt:
        try:
            return json.dumps(json.loads(raw_val))
        except Exception:
            try:
                # Handle Python literal representation strings like "['React', 'SQL']"
                val = ast.literal_eval(raw_val)
                return json.dumps(val)
            except Exception:
                return json.dumps(raw_val)

    # Date
    if dt == "date":
        try:
            return date.fromisoformat(raw_val.strip()[:10])
        except Exception:
            return raw_val.strip()

    # Time
    if "time" in dt and "timestamp" not in dt:
        try:
            return time.fromisoformat(raw_val.strip())
        except Exception:
            return raw_val.strip()

    # Timestamp
    if "timestamp" in dt:
        clean = raw_val.strip().replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(clean)
        except Exception:
            return raw_val.strip()

    return raw_val


def import_csv_to_supabase():
    args = parse_args()
    csv_dir = Path(args.csv_dir)

    if not csv_dir.is_dir():
        print(f"[ERROR] CSV directory not found: {csv_dir.resolve()}")
        sys.exit(1)

    csv_files = {p.stem: p for p in csv_dir.glob("*.csv")}
    print(f"Found {len(csv_files)} CSV files in '{csv_dir}'.")

    conn, active_url = get_db_connection(args)

    with conn:
        with conn.cursor() as cur:
            # 2. Inspect Target Schema in Supabase
            print("[2/5] Inspecting Supabase public schema & dependencies...")
            table_names, col_info, pk_info, fk_deps = get_table_metadata(cur)

            if not table_names or len(table_names) < len(csv_files):
                print("\n[NOTICE] Ensuring all database tables exist in Supabase...")
                try:
                    from sqlalchemy import create_engine, MetaData, text
                    from app.core.database import Base
                    import app.models.domain  # noqa: F401

                    # Ensure standard sqlalchemy psycopg2 URL with sslmode=require
                    sa_url = active_url
                    if "postgresql://" in sa_url and "postgresql+psycopg2://" not in sa_url:
                        sa_url = sa_url.replace("postgresql://", "postgresql+psycopg2://", 1)
                    connect_args = {"sslmode": "require"} if "supabase" in sa_url else {}
                    supa_engine = create_engine(sa_url, pool_pre_ping=True, connect_args=connect_args)

                    # 1. First create the 17 core ORM tables
                    Base.metadata.create_all(bind=supa_engine)

                    # 2. Check if local task_tracking_db is available to reflect remaining schema tables
                    local_url = os.getenv("LOCAL_DATABASE_URL", "postgresql+psycopg2://postgres:root@localhost:5432/task_tracking_db")
                    try:
                        local_engine = create_engine(local_url, pool_pre_ping=True)
                        with local_engine.connect() as lconn:
                            lconn.execute(text("SELECT 1"))
                        local_meta = MetaData()
                        local_meta.reflect(bind=local_engine)
                        # Create any additional tables found in local DB on Supabase
                        local_meta.create_all(bind=supa_engine)
                        print(f"         Reflected and ensured {len(local_meta.tables)} total tables directly in Supabase!")
                    except Exception as e:
                        print(f"         Local schema reflection skipped ({e}); core ORM tables created.")

                    table_names, col_info, pk_info, fk_deps = get_table_metadata(cur)
                except Exception as e:
                    print(f"         Could not auto-create tables: {e}")

            # Tables to process (intersection of CSV files and database tables)
            matching_tables = [t for t in table_names if t in csv_files]
            if not matching_tables:
                print("[ERROR] No database tables matched the CSV file names!")
                return False

            # Determine parent -> child insertion order
            import_order = topological_sort(matching_tables, fk_deps)

            # 3. Optional Clear / Replace Mode
            if args.replace:
                print("\n[3/5] Truncating tables in reverse dependency order (--replace active)...")
                # Temporarily disable foreign key triggers if superuser, or truncate in reverse
                for t in reversed(import_order):
                    cur.execute(f'TRUNCATE TABLE public."{t}" CASCADE;')
                    print(f"      Cleared table: {t}")

            # 4. Import Data
            print(f"\n[4/5] Importing {len(import_order)} tables in dependency order...")
            total_records_inserted = 0

            for table_name in import_order:
                csv_file = csv_files[table_name]
                table_cols = col_info.get(table_name, {})
                table_pks = pk_info.get(table_name, [])

                with open(csv_file, "r", encoding="utf-8-sig", newline="") as f:
                    reader = csv.DictReader(f)
                    fieldnames = reader.fieldnames or []
                    rows = list(reader)

                valid_cols = [c for c in fieldnames if c in table_cols]
                if not valid_cols:
                    print(f"  [SKIP] {table_name:30s} -> No matching columns in DB")
                    continue

                if not rows:
                    print(f"  [EMPTY] {table_name:29s} -> CSV has 0 data rows")
                    continue

                # Prepare parameterized batch insert / upsert
                col_identifiers = ", ".join([f'"{c}"' for c in valid_cols])
                val_placeholders = ", ".join(["%s" for _ in valid_cols])

                # Build SQL statement (with ON CONFLICT DO UPDATE if PK exists)
                if table_pks and all(pk in valid_cols for pk in table_pks) and not args.replace:
                    pk_clause = ", ".join([f'"{pk}"' for pk in table_pks])
                    update_cols = [c for c in valid_cols if c not in table_pks]
                    if update_cols:
                        update_clause = ", ".join([f'"{c}" = EXCLUDED."{c}"' for c in update_cols])
                        sql_stmt = f"""
                            INSERT INTO public."{table_name}" ({col_identifiers})
                            VALUES ({val_placeholders})
                            ON CONFLICT ({pk_clause}) DO UPDATE SET {update_clause};
                        """
                    else:
                        sql_stmt = f"""
                            INSERT INTO public."{table_name}" ({col_identifiers})
                            VALUES ({val_placeholders})
                            ON CONFLICT ({pk_clause}) DO NOTHING;
                        """
                else:
                    sql_stmt = f"""
                        INSERT INTO public."{table_name}" ({col_identifiers})
                        VALUES ({val_placeholders});
                    """

                # Parse and cast all rows
                batch_data = []
                for row in rows:
                    row_vals = [parse_cell(row.get(col_name), table_cols[col_name]) for col_name in valid_cols]
                    batch_data.append(tuple(row_vals))

                # Execute batch
                cur.executemany(sql_stmt, batch_data)
                total_records_inserted += len(batch_data)

                # Reset sequence for tables with integer ID
                if "id" in table_cols:
                    try:
                        cur.execute(
                            f"""
                            SELECT setval(
                                pg_get_serial_sequence('public."{table_name}"', 'id'),
                                COALESCE((SELECT MAX(id) FROM public."{table_name}"), 1),
                                EXISTS (SELECT 1 FROM public."{table_name}")
                            );
                            """
                        )
                    except Exception:
                        pass

                print(f"  [OK]   {table_name:30s} -> {len(batch_data):4d} rows imported")

            conn.commit()

            # 5. Verification
            print("\n[5/5] Verifying final table row counts in Supabase...")
            print("-" * 50)
            for table_name in import_order:
                cur.execute(f'SELECT COUNT(*) FROM public."{table_name}";')
                count = cur.fetchone()[0]
                print(f"  {table_name:32s} : {count:5d} rows")
            print("-" * 50)
            print(f"\n[SUCCESS] Completed importing {total_records_inserted} rows across {len(import_order)} tables into Supabase!")
            return True


if __name__ == "__main__":
    success = import_csv_to_supabase()
    if not success:
        sys.exit(1)
