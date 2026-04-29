"""
Data ingestion pipeline — validates, cleans, and upserts election CSVs.

Usage (CLI):
    python ingest.py --file results.csv --state Tamil_Nadu --year 2026 --election-type AE

Also exposed as POST /v1/admin/ingest for API-based ingestion.
"""

import argparse
import csv
import io
import logging
import sys
from datetime import datetime, timezone

logger = logging.getLogger("ingest")

EXPECTED_COLUMNS = [
    "state_name", "assembly_no", "constituency_no", "year", "month",
    "delim_id", "poll_no", "position", "candidate", "sex", "party",
    "votes", "age", "candidate_type", "valid_votes", "electors",
    "constituency_name", "constituency_type", "district_name", "sub_region",
    "n_cand", "turnout_percentage", "vote_share_percentage", "deposit_lost",
    "margin", "margin_percentage", "enop", "pid", "party_type_tcpd",
    "party_id", "last_poll", "contested", "last_party", "last_party_id",
    "last_constituency_name", "same_constituency", "same_party", "no_terms",
    "turncoat", "incumbent", "recontest", "myneta_education",
    "tcpd_prof_main", "tcpd_prof_main_desc", "tcpd_prof_second",
    "tcpd_prof_second_desc", "election_type",
]

INT_COLUMNS = {
    "assembly_no", "constituency_no", "year", "month", "delim_id",
    "poll_no", "position", "votes", "age", "valid_votes", "electors",
    "n_cand", "margin", "party_id", "contested", "no_terms",
}

NUMERIC_COLUMNS = {
    "turnout_percentage", "vote_share_percentage", "margin_percentage", "enop",
}


class IngestionResult:
    def __init__(self):
        self.inserted = 0
        self.updated = 0
        self.skipped = 0
        self.errors: list[str] = []
        self.started_at = datetime.now(timezone.utc)

    def summary(self) -> dict:
        return {
            "inserted": self.inserted,
            "updated": self.updated,
            "skipped": self.skipped,
            "errors": self.errors[:50],  # cap error list
            "total_errors": len(self.errors),
            "duration_seconds": (datetime.now(timezone.utc) - self.started_at).total_seconds(),
        }


def validate_schema(headers: list[str]) -> list[str]:
    """Check CSV headers against expected schema. Returns list of errors."""
    errors = []
    lc_headers = [h.strip().lower() for h in headers]
    missing = [c for c in EXPECTED_COLUMNS if c not in lc_headers]
    if missing:
        errors.append(f"Missing columns: {', '.join(missing)}")
    return errors


def clean_row(row: dict) -> dict:
    """Normalize a single CSV row."""
    cleaned = {}
    for col in EXPECTED_COLUMNS:
        val = row.get(col, "").strip()
        if val in ("", "NA", "N/A", "nan", "None"):
            cleaned[col] = None
        elif col in INT_COLUMNS:
            try:
                cleaned[col] = int(float(val))
            except (ValueError, TypeError):
                cleaned[col] = None
        elif col in NUMERIC_COLUMNS:
            try:
                cleaned[col] = float(val)
            except (ValueError, TypeError):
                cleaned[col] = None
        else:
            cleaned[col] = val
    return cleaned


async def ingest_csv(pool, csv_text: str) -> IngestionResult:
    """
    Validate, clean, and upsert CSV data into tcpd_ae.

    Uses ON CONFLICT on (state_name, year, constituency_no, position, poll_no, election_type)
    to update existing records and insert new ones.
    Entire operation is wrapped in a transaction.
    """
    result = IngestionResult()
    reader = csv.DictReader(io.StringIO(csv_text))

    if not reader.fieldnames:
        result.errors.append("Empty CSV or missing headers")
        return result

    # Normalize headers
    reader.fieldnames = [h.strip().lower() for h in reader.fieldnames]
    schema_errors = validate_schema(reader.fieldnames)
    if schema_errors:
        result.errors.extend(schema_errors)
        return result

    rows = []
    for i, raw_row in enumerate(reader, start=2):
        lc_row = {k.strip().lower(): v for k, v in raw_row.items()}
        try:
            cleaned = clean_row(lc_row)
            if not cleaned.get("candidate") or not cleaned.get("constituency_name"):
                result.errors.append(f"Row {i}: missing required field (candidate or constituency_name)")
                result.skipped += 1
                continue
            rows.append(cleaned)
        except Exception as e:
            result.errors.append(f"Row {i}: {str(e)}")
            result.skipped += 1

    if not rows:
        result.errors.append("No valid rows to ingest")
        return result

    # Ensure unique constraint exists for upsert
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_tcpd_upsert
                ON tcpd_ae(state_name, year, constituency_no, position, COALESCE(poll_no, 0), election_type)
            """)

            cols = EXPECTED_COLUMNS
            placeholders = ", ".join(f"${i+1}" for i in range(len(cols)))
            col_list = ", ".join(cols)
            update_set = ", ".join(f"{c} = EXCLUDED.{c}" for c in cols if c not in (
                "state_name", "year", "constituency_no", "position", "poll_no", "election_type"
            ))

            upsert_sql = f"""
                INSERT INTO tcpd_ae ({col_list})
                VALUES ({placeholders})
                ON CONFLICT (state_name, year, constituency_no, position, COALESCE(poll_no, 0), election_type)
                DO UPDATE SET {update_set}
            """

            for row in rows:
                vals = [row.get(c) for c in cols]
                try:
                    r = await conn.execute(upsert_sql, *vals)
                    if "UPDATE" in r:
                        result.updated += 1
                    else:
                        result.inserted += 1
                except Exception as e:
                    result.errors.append(f"Row ({row.get('state_name')}, {row.get('year')}, {row.get('constituency_no')}): {str(e)}")
                    result.skipped += 1

    logger.info(
        "Ingestion complete: inserted=%d updated=%d skipped=%d errors=%d",
        result.inserted, result.updated, result.skipped, len(result.errors),
    )

    # Refresh materialized views after data ingestion
    try:
        from national_routes import refresh_materialized_views
        await refresh_materialized_views(pool)
    except Exception as e:
        logger.warning("Failed to refresh materialized views after ingestion: %s", e)

    return result


# ── CLI entrypoint ──────────────────────────────────────────

async def _cli_main():
    import asyncpg
    import os

    parser = argparse.ArgumentParser(description="Ingest election CSV data")
    parser.add_argument("--file", required=True, help="Path to CSV file")
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL", ""), help="PostgreSQL URL")
    args = parser.parse_args()

    if not args.database_url:
        print("ERROR: Set DATABASE_URL or pass --database-url", file=sys.stderr)
        sys.exit(1)

    with open(args.file, encoding="utf-8") as f:
        csv_text = f.read()

    pool = await asyncpg.create_pool(args.database_url, min_size=1, max_size=2)
    try:
        result = await ingest_csv(pool, csv_text)
        print(f"Inserted: {result.inserted}")
        print(f"Updated: {result.updated}")
        print(f"Skipped: {result.skipped}")
        if result.errors:
            print(f"Errors ({len(result.errors)}):")
            for err in result.errors[:20]:
                print(f"  - {err}")
    finally:
        await pool.close()


if __name__ == "__main__":
    import asyncio
    asyncio.run(_cli_main())
