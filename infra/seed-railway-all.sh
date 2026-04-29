#!/usr/bin/env bash
# Seed Railway production database with all-states AE + GE data.
# Usage: ./infra/seed-railway.sh <DATABASE_URL>
# Example: ./infra/seed-railway.sh "postgresql://postgres:xxx@mainline.proxy.rlwy.net:13760/railway"
#
# Run from the project root directory where rough/ CSVs exist.

set -euo pipefail

DB_URL="${1:?Usage: $0 <DATABASE_URL>}"

echo "=== Seeding Railway database ==="

echo "1. Dropping unique index (for bulk load)..."
psql "$DB_URL" -c "DROP INDEX IF EXISTS idx_tcpd_unique_entry;"

echo "2. Truncating tcpd_ae..."
psql "$DB_URL" -c "TRUNCATE tcpd_ae RESTART IDENTITY CASCADE;"

echo "3. Loading AE data (~483K rows, ~108MB — this takes 2-3 min)..."
time psql "$DB_URL" -c "\COPY tcpd_ae (
  state_name, assembly_no, constituency_no, year, month, delim_id, poll_no,
  position, candidate, sex, party, votes, age, candidate_type, valid_votes,
  electors, constituency_name, constituency_type, district_name, sub_region,
  n_cand, turnout_percentage, vote_share_percentage, deposit_lost, margin,
  margin_percentage, enop, pid, party_type_tcpd, party_id, last_poll,
  contested, last_party, last_party_id, last_constituency_name,
  same_constituency, same_party, no_terms, turncoat, incumbent, recontest,
  myneta_education, tcpd_prof_main, tcpd_prof_main_desc, tcpd_prof_second,
  tcpd_prof_second_desc, election_type
) FROM 'rough/TCPD_AE_All_States_2026-4-20.csv' CSV HEADER"

echo "4. Loading GE data (~91K rows, ~20MB)..."
time psql "$DB_URL" -c "\COPY tcpd_ae (
  state_name, assembly_no, constituency_no, year, month,
  poll_no, delim_id,
  position, candidate, sex, party, votes,
  candidate_type, valid_votes, electors, constituency_name, constituency_type,
  sub_region, n_cand, turnout_percentage, vote_share_percentage,
  deposit_lost, margin, margin_percentage, enop, pid,
  party_type_tcpd, party_id, last_poll, contested, last_party,
  last_party_id, last_constituency_name, same_constituency, same_party,
  no_terms, turncoat, incumbent, recontest, myneta_education,
  tcpd_prof_main, tcpd_prof_main_desc, tcpd_prof_second,
  tcpd_prof_second_desc, election_type
) FROM 'rough/TCPD_GE_All_States_2026-4-20.csv' CSV HEADER"

echo "5. Deduplicating..."
psql "$DB_URL" -c "
DELETE FROM tcpd_ae a USING tcpd_ae b
WHERE a.id > b.id
  AND a.state_name = b.state_name
  AND a.year = b.year
  AND a.constituency_no = b.constituency_no
  AND a.candidate = b.candidate
  AND COALESCE(a.poll_no, 0) = COALESCE(b.poll_no, 0)
  AND COALESCE(a.election_type, '') = COALESCE(b.election_type, '');"

echo "6. Recreating unique index..."
psql "$DB_URL" -c "CREATE UNIQUE INDEX idx_tcpd_unique_entry
  ON tcpd_ae (state_name, year, constituency_no, candidate, COALESCE(poll_no, 0), COALESCE(election_type, ''));"

echo "7. Rebuilding other indexes..."
psql "$DB_URL" -c "REINDEX TABLE tcpd_ae;"
psql "$DB_URL" -c "ANALYZE tcpd_ae;"

echo ""
echo "=== Verification ==="
psql "$DB_URL" -c "
SELECT
  CASE WHEN election_type ILIKE '%AE%' THEN 'AE'
       WHEN election_type ILIKE '%GE%' THEN 'GE'
       ELSE 'OTHER' END AS type,
  COUNT(*) AS rows,
  COUNT(DISTINCT state_name) AS states,
  MIN(year) AS year_min,
  MAX(year) AS year_max
FROM tcpd_ae GROUP BY 1 ORDER BY 1;"

echo ""
echo "=== Done ==="
