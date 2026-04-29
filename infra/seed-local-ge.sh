#!/usr/bin/env bash
set -euo pipefail

echo "=== Loading GE (Lok Sabha) data into local DB ==="

echo "1. Dropping old unique index (may not include election_type)..."
docker exec elec_postgres psql -U elec -d elec -c "DROP INDEX IF EXISTS idx_tcpd_unique_entry;"

echo "2. COPYing GE rows..."
docker exec elec_postgres psql -U elec -d elec -c "
COPY tcpd_ae (
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
) FROM '/data/tcpd_ge_all.csv' CSV HEADER;"

echo "3. Deduplicating..."
docker exec elec_postgres psql -U elec -d elec -c "
DELETE FROM tcpd_ae a USING tcpd_ae b
WHERE a.id > b.id
  AND a.state_name = b.state_name
  AND a.year = b.year
  AND a.constituency_no = b.constituency_no
  AND a.candidate = b.candidate
  AND COALESCE(a.poll_no, 0) = COALESCE(b.poll_no, 0)
  AND COALESCE(a.election_type, '') = COALESCE(b.election_type, '');"

echo "4. Recreating unique index (with election_type)..."
docker exec elec_postgres psql -U elec -d elec -c "
CREATE UNIQUE INDEX idx_tcpd_unique_entry
  ON tcpd_ae (state_name, year, constituency_no, candidate, COALESCE(poll_no, 0), COALESCE(election_type, ''));"

echo "5. Adding composite index..."
docker exec elec_postgres psql -U elec -d elec -c "
CREATE INDEX IF NOT EXISTS idx_tcpd_state_election_type ON tcpd_ae(state_name, election_type);"

echo "6. Verifying..."
docker exec elec_postgres psql -U elec -d elec -c "
SELECT
  CASE WHEN election_type ILIKE '%AE%' THEN 'AE' ELSE 'GE' END AS type,
  COUNT(*) AS rows,
  COUNT(DISTINCT state_name) AS states
FROM tcpd_ae GROUP BY 1 ORDER BY 1;"

echo "=== Done ==="
