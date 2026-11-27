"""Export all public tables from Supabase PostgreSQL database into task_tracking_db_supabase_csv/

Usage:
    python export_supabase_db.py
    python export_supabase_db.py --password "YOUR_SUPABASE_PASSWORD"
    python export_supabase_db.py --url "postgresql://postgres.xxx:pwd@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require"
"""

import argparse
import csv
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import psycopg
from psycopg import sql

# Load backend/.env
env_path = Path("backend/.env")
if env_path.exists():
    load_dotenv(env_path)

output_dir = Path("task_tracking_db_supabase_csv")
output_dir.mkdir(exist_ok=True)

def parse_args():
    parser = argparse.ArgumentParser(description="Export Supabase database tables to CSV")
    parser.add_argument("--url", help="Full Supabase PostgreSQL connection URL")
    parser.add_argument("--host", default=os.getenv("PGHOST", "aws-0-ap-northeast-1.pooler.supabase.com"))
    parser.add_argument("--port", type=int, default=int(os.getenv("PGPORT", 5432)))
    parser.add_argument("--user", default=os.getenv("PGUSER", "postgres.zqqqczikmeupsrjukcug"))
    parser.add_argument("--password", default=os.getenv("PGPASSWORD", "Task_Ingage"))
    parser.add_argument("--dbname", default=os.getenv("PGDATABASE", "postgres"))
    return parser.parse_args()

def export_supabase():
    args = parse_args()
    
    print(f"Connecting to Supabase host: {args.host}:{args.port} as user '{args.user}'...")
    
    try:
        if args.url:
            conn = psycopg.connect(args.url, connect_timeout=15)
        else:
            conn = psycopg.connect(
                host=args.host,
                port=args.port,
                user=args.user,
                password=args.password,
                dbname=args.dbname,
                sslmode="require",
                connect_timeout=15
            )
    except Exception as exc:
        print(f"\n[ERROR] Failed to connect to Supabase: {exc}")
        print("\nPlease verify:")
        print("1. Your Supabase Database Password (reset in Supabase Dashboard -> Project Settings -> Database).")
        print("2. Update PGPASSWORD / DATABASE_URL in backend/.env, or pass --password <pwd> to this script.")
        return False

    with conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT tablename
                FROM pg_catalog.pg_tables
                WHERE schemaname = 'public'
                ORDER BY tablename
            """)
            table_names = [row[0] for row in cur.fetchall()]

        print(f"Found {len(table_names)} public tables in Supabase. Exporting to {output_dir.resolve()}...")
        
        for table_name in table_names:
            csv_file = output_dir / f"{table_name}.csv"
            with conn.cursor() as cur:
                cur.execute(
                    sql.SQL("SELECT * FROM {}.{}").format(
                        sql.Identifier("public"),
                        sql.Identifier(table_name),
                    )
                )
                with csv_file.open("w", newline="", encoding="utf-8") as file:
                    writer = csv.writer(file)
                    writer.writerow(column.name for column in cur.description)
                    row_count = 0
                    while rows := cur.fetchmany(1000):
                        writer.writerows(rows)
                        row_count += len(rows)
                print(f"  - {table_name:30s} -> {row_count} rows exported")

    print(f"\n[SUCCESS] Exported {len(table_names)} tables into '{output_dir}'.")
    return True

if __name__ == "__main__":
    success = export_supabase()
    if not success:
        sys.exit(1)
