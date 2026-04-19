#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────
# Seed Railway PostgreSQL with election CSV data
#
# Usage:
#   1. Copy the DATABASE_URL from Railway dashboard
#      (Project → PostgreSQL → Connect → Connection URL)
#   2. Run: ./infra/seed-railway.sh <DATABASE_URL> <CSV_FILE>
#
# Example:
#   ./infra/seed-railway.sh "postgresql://postgres:xxx@xxx.railway.app:5432/railway" TCPD_AE_Tamil_Nadu_2026-4-12.csv
# ──────────────────────────────────────────────────────────
set -euo pipefail

DB_URL="${1:?Usage: $0 <DATABASE_URL> <CSV_FILE>}"
CSV_FILE="${2:?Usage: $0 <DATABASE_URL> <CSV_FILE>}"

if [ ! -f "$CSV_FILE" ]; then
    echo "ERROR: CSV file not found: $CSV_FILE"
    exit 1
fi

# Check if psql is available
if ! command -v psql &>/dev/null; then
    echo "ERROR: psql not found. Install with: brew install libpq"
    exit 1
fi

echo "==> Checking if data already exists..."
ROW_COUNT=$(psql "$DB_URL" -t -c "SELECT COUNT(*) FROM tcpd_ae;" 2>/dev/null || echo "0")
ROW_COUNT=$(echo "$ROW_COUNT" | tr -d ' ')

if [ "$ROW_COUNT" -gt "0" ] 2>/dev/null; then
    echo "    Database already has $ROW_COUNT rows in tcpd_ae."
    read -p "    Drop and re-seed? [y/N] " confirm
    if [[ "$confirm" != [yY] ]]; then
        echo "    Skipped."
        exit 0
    fi
    echo "==> Truncating tcpd_ae..."
    psql "$DB_URL" -c "TRUNCATE tcpd_ae RESTART IDENTITY;"
fi

echo "==> Seeding CSV data from $CSV_FILE ..."
# Use \copy (client-side) instead of COPY (server-side) so the file is read locally
psql "$DB_URL" -c "\copy tcpd_ae (state_name, assembly_no, constituency_no, year, month, delim_id, poll_no, position, candidate, sex, party, votes, age, candidate_type, valid_votes, electors, constituency_name, constituency_type, district_name, sub_region, n_cand, turnout_percentage, vote_share_percentage, deposit_lost, margin, margin_percentage, enop, pid, party_type_tcpd, party_id, last_poll, contested, last_party, last_party_id, last_constituency_name, same_constituency, same_party, no_terms, turncoat, incumbent, recontest, myneta_education, tcpd_prof_main, tcpd_prof_main_desc, tcpd_prof_second, tcpd_prof_second_desc, election_type) FROM '$CSV_FILE' WITH (FORMAT csv, HEADER true, NULL '')"

echo "==> Deduplicating..."
psql "$DB_URL" -c "
DELETE FROM tcpd_ae a USING tcpd_ae b
WHERE a.id > b.id
  AND a.year = b.year
  AND a.constituency_no = b.constituency_no
  AND a.candidate = b.candidate
  AND a.poll_no IS NOT DISTINCT FROM b.poll_no;
"

echo "==> Creating unique constraint..."
psql "$DB_URL" -c "
CREATE UNIQUE INDEX IF NOT EXISTS idx_tcpd_unique_entry
  ON tcpd_ae (year, constituency_no, candidate, COALESCE(poll_no, 0));
"

FINAL_COUNT=$(psql "$DB_URL" -t -c "SELECT COUNT(*) FROM tcpd_ae;")
echo "==> Done! $FINAL_COUNT rows in tcpd_ae."
