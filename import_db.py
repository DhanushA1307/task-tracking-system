import argparse
import csv
import getpass
from contextlib import closing
from pathlib import Path

import psycopg2
from psycopg2 import sql


DATABASE_NAME = "task_tracking_db"
SCHEMA_NAME = "public"
CSV_DIR = Path(__file__).resolve().parent / "task_tracking_db_csv"


def get_import_order(cursor, table_names):
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
        (SCHEMA_NAME, SCHEMA_NAME),
    )

    dependencies = {table_name: set() for table_name in table_names}
    for child, parent in cursor.fetchall():
        if child != parent:
            dependencies[child].add(parent)

    import_order = []
    while dependencies:
        ready = sorted(
            table_name
            for table_name, parents in dependencies.items()
            if not parents
        )
        if not ready:
            cyclic_tables = ", ".join(sorted(dependencies))
            raise RuntimeError(
                "Cannot determine a safe import order because of circular "
                f"foreign keys involving: {cyclic_tables}"
            )

        import_order.extend(ready)
        for table_name in ready:
            dependencies.pop(table_name)
        for parents in dependencies.values():
            parents.difference_update(ready)

    return import_order


def get_table_columns(cursor, table_name):
    cursor.execute(
        sql.SQL("SELECT * FROM {}.{} LIMIT 0").format(
            sql.Identifier(SCHEMA_NAME),
            sql.Identifier(table_name),
        )
    )
    return [column.name for column in cursor.description]


def ensure_csv_files(table_names):
    csv_tables = {path.stem for path in CSV_DIR.glob("*.csv")}
    database_tables = set(table_names)
    missing = sorted(database_tables - csv_tables)
    extra = sorted(csv_tables - database_tables)
    if missing or extra:
        details = []
        if missing:
            details.append(f"missing CSV files: {', '.join(missing)}")
        if extra:
            details.append(f"unknown CSV files: {', '.join(extra)}")
        raise RuntimeError("CSV set does not match public tables (" + "; ".join(details) + ")")


def import_database(replace_existing):
    if not CSV_DIR.is_dir():
        raise FileNotFoundError(f"CSV directory not found: {CSV_DIR}")

    password = getpass.getpass("PostgreSQL password: ")
    with closing(
        psycopg2.connect(
            host="localhost",
            dbname=DATABASE_NAME,
            user="postgres",
            password=password,
        )
    ) as conn, conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT tablename
                FROM pg_catalog.pg_tables
                WHERE schemaname = %s
                ORDER BY tablename
                """,
                (SCHEMA_NAME,),
            )
            table_names = [row[0] for row in cursor.fetchall()]
            if not table_names:
                raise RuntimeError(f"No tables found in schema {SCHEMA_NAME!r}")

            ensure_csv_files(table_names)
            import_order = get_import_order(cursor, table_names)

            for table_name in table_names:
                csv_path = CSV_DIR / f"{table_name}.csv"
                with csv_path.open("r", newline="", encoding="utf-8") as csv_file:
                    csv_header = next(csv.reader(csv_file), None)
                expected_header = get_table_columns(cursor, table_name)
                if csv_header != expected_header:
                    raise RuntimeError(
                        f"CSV header mismatch for {csv_path.name}. "
                        f"Expected {expected_header}, got {csv_header}."
                    )

            if replace_existing:
                confirmation = input(
                    f"This will replace data in every public table in "
                    f"{DATABASE_NAME!r}. Type the database name to continue: "
                )
                if confirmation != DATABASE_NAME:
                    print("Import cancelled; no data was changed.")
                    return
                truncate_statement = sql.SQL("TRUNCATE TABLE {} RESTART IDENTITY").format(
                    sql.SQL(", ").join(
                        sql.Identifier(SCHEMA_NAME, table_name)
                        for table_name in table_names
                    )
                )
                cursor.execute(truncate_statement)
            else:
                for table_name in table_names:
                    cursor.execute(
                        sql.SQL("SELECT EXISTS (SELECT 1 FROM {}.{} LIMIT 1)").format(
                            sql.Identifier(SCHEMA_NAME),
                            sql.Identifier(table_name),
                        )
                    )
                    if cursor.fetchone()[0]:
                        raise RuntimeError(
                            f"Table {SCHEMA_NAME}.{table_name} is not empty. "
                            "Use --replace to confirm replacing existing data."
                        )

            for table_name in import_order:
                copy_statement = sql.SQL(
                    "COPY {}.{} ({}) FROM STDIN WITH (FORMAT CSV, HEADER TRUE, NULL '')"
                ).format(
                    sql.Identifier(SCHEMA_NAME),
                    sql.Identifier(table_name),
                    sql.SQL(", ").join(
                        sql.Identifier(column)
                        for column in get_table_columns(cursor, table_name)
                    ),
                )
                csv_path = CSV_DIR / f"{table_name}.csv"
                with csv_path.open("r", newline="", encoding="utf-8") as csv_file:
                    cursor.copy_expert(copy_statement.as_string(conn), csv_file)
                print(f"Imported {table_name}")

            cursor.execute(
                """
                SELECT table_name, column_name
                FROM information_schema.columns
                WHERE table_schema = %s
                  AND (column_default LIKE 'nextval(%%' OR is_identity = 'YES')
                """,
                (SCHEMA_NAME,),
            )
            sequence_columns = cursor.fetchall()
            for table_name, column_name in sequence_columns:
                cursor.execute(
                    "SELECT pg_get_serial_sequence(%s, %s)",
                    (f"{SCHEMA_NAME}.{table_name}", column_name),
                )
                sequence_name = cursor.fetchone()[0]
                if sequence_name is None:
                    continue

                cursor.execute(
                    sql.SQL("SELECT MAX({}) FROM {}.{}").format(
                        sql.Identifier(column_name),
                        sql.Identifier(SCHEMA_NAME),
                        sql.Identifier(table_name),
                    )
                )
                max_value = cursor.fetchone()[0]
                cursor.execute(
                    "SELECT setval(%s::regclass, %s, %s)",
                    (sequence_name, max_value or 1, max_value is not None),
                )

    print(f"Imported {len(table_names)} tables from {CSV_DIR}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Import all public-table CSV files into task_tracking_db."
    )
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Replace existing public-table data after typing the database name.",
    )
    arguments = parser.parse_args()
    import_database(arguments.replace)