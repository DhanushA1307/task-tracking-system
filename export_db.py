# python -m pip install "psycopg[binary]"
import csv
import getpass
from pathlib import Path

import psycopg
from psycopg import sql

output_dir = Path("task_tracking_db_csv")
output_dir.mkdir(exist_ok=True)

with psycopg.connect(
    host="localhost",
    dbname="task_tracking_db",
    user="postgres",
    password=getpass.getpass("PostgreSQL password: "),
) as conn:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT tablename
            FROM pg_catalog.pg_tables
            WHERE schemaname = 'public'
            ORDER BY tablename
        """)
        table_names = [row[0] for row in cur.fetchall()]

    for table_name in table_names:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL("SELECT * FROM {}.{}").format(
                    sql.Identifier("public"),
                    sql.Identifier(table_name),
                )
            )
            with (output_dir / f"{table_name}.csv").open(
                "w", newline="", encoding="utf-8"
            ) as file:
                writer = csv.writer(file)
                writer.writerow(column.name for column in cur.description)
                while rows := cur.fetchmany(1000):
                    writer.writerows(rows)

print(f"Exported {len(table_names)} tables to {output_dir.resolve()}")