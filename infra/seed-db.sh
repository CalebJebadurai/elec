#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
# Seed the Cloud SQL database with election data
# Run ONCE after terraform apply
# ─────────────────────────────────────────────────────────
set -euo pipefail

INSTANCE="${1:-elec-postgres}"
REGION="${2:-asia-south1}"
DB="elec"
USER="elec"
CSV_FILE="../../TCPD_AE_Tamil_Nadu_2026-4-12.csv"

echo "=== Seeding Cloud SQL: ${INSTANCE} ==="

# Check if Cloud SQL Proxy is available
if ! command -v cloud-sql-proxy &> /dev/null; then
  echo "Installing Cloud SQL Auth Proxy..."
  curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.14.0/cloud-sql-proxy.darwin.arm64
  chmod +x cloud-sql-proxy
fi

PROJECT_ID=$(gcloud config get-value project)
CONNECTION="${PROJECT_ID}:${REGION}:${INSTANCE}"

# Start proxy in background
echo "→ Starting Cloud SQL proxy..."
./cloud-sql-proxy "${CONNECTION}" --port=5433 &
PROXY_PID=$!
sleep 3

cleanup() { kill $PROXY_PID 2>/dev/null || true; }
trap cleanup EXIT

echo "→ Running init.sql..."
PGPASSWORD="${DB_PASSWORD:?Set DB_PASSWORD}" psql \
  -h 127.0.0.1 -p 5433 -U "${USER}" -d "${DB}" \
  -f ../../init.sql

echo "→ Loading CSV data..."
PGPASSWORD="${DB_PASSWORD}" psql \
  -h 127.0.0.1 -p 5433 -U "${USER}" -d "${DB}" \
  -c "\COPY tcpd_ae(state_name,assembly_no,constituency_no,year,month,delim_id,poll_no,position,candidate,sex,party,votes,age,candidate_type,valid_votes,electors,constituency_name,constituency_type,district_name,sub_region,n_cand,turnout_percentage,vote_share_percentage,deposit_lost,margin,margin_percentage,enop,pid,party_type_tcpd,party_id,last_poll,contested,last_party,last_party_id,last_constituency_name,same_constituency,same_party,no_terms,turncoat,incumbent,recontest,myneta_education,tcpd_prof_main,tcpd_prof_main_desc,tcpd_prof_second,tcpd_prof_second_desc,election_type) FROM '${CSV_FILE}' CSV HEADER"

echo ""
echo "=== Database seeded successfully ==="
echo "Tables created: tcpd_ae, users, bookmarks, votes"
