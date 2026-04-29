# Implementation Phases: Tech Stack Evaluation

**Date:** 2026-04-28  
**Source:** [Full Analysis](../analysis/2026-04-28-tech-stack-evaluation.md)  
**Decision:** Keep Python/FastAPI + React + PostgreSQL. Optimize + migrate hosting.  
**Total Effort:** ~11 days

---

## Phase 1: Quick-Win Performance Optimizations (Days 1-2)

- **Step 1.1:** Switch to orjson (ORJSONResponse default) — large response serialization 3-10x faster
- **Step 1.2:** Increase cache TTLs — state data 5min → 24hrs, add admin cache-bust endpoint (admin-only, rate-limited to 1/min)
- **Step 1.3:** Consolidate national route caching — `_NATIONAL_CACHE` dict → Redis-backed `cache.py`
- **Step 1.4:** Create slim response models — 48-field Election → 8-15 field list models
- **Step 1.5:** Add 3 missing composite indexes (state+position+et, party+state+year, candidate trigram)
- **Step 1.6:** Increase uvicorn workers 2 → 4 (pair with Redis-available rate limiting)
- **Step 1.7:** Fix SUM(DISTINCT electors) — pre-group by constituency before summing
- **Step 1.8:** Add cache stampede protection — Redis SETNX distributed lock on cache miss

## Phase 2: Hosting Migration to GCP Cloud Run Mumbai (Days 3-7)

- **Step 2.0:** GCP prerequisites — create project, enable billing, gcloud CLI, state bucket, Artifact Registry
- **Step 2.1:** Update Terraform — override `db_tier` to `db-f1-micro`, set min-instances=1, add Upstash Redis env vars
- **Step 2.2:** Provision Cloud SQL + seed election data from CSVs, migrate user data via `pg_dump`/`pg_restore`
- **Step 2.3:** Deploy API to Cloud Run, verify endpoints against test suite
- **Step 2.4:** Deploy frontend to GCS + CDN, configure URL routing on Global LB
- **Step 2.5:** Performance validation from Indian client, DNS cutover, 1-week Railway fallback

## Phase 3: Database Query Optimization (Days 8-11)

- **Step 3.1:** Rewrite national state summary — pre-grouped subqueries, single-scan CTEs
- **Step 3.2:** Combine party strength from 3 queries → 1 (SQL CASE for party normalization)
- **Step 3.3:** Add materialized views — event-driven refresh on data ingestion, hourly cron fallback

**Deferred:** Prediction data pagination (requires frontend changes, separate phase)

---

## Cost Model

| Traffic Level | GCP Cloud Run Mumbai | DigitalOcean Bangalore | Railway Pro |
|---|---|---|---|
| 1K MAU | ~$12-15/mo | ~$6/mo | ~$5-8/mo |
| 10K MAU | ~$15-20/mo | ~$12/mo | ~$8-13/mo |
| 50K MAU spike | ~$25-35/mo | ~$12 (may struggle) | ~$15-23/mo |

*GCP includes: Cloud Run $1-5, Cloud SQL db-f1-micro $8.50, Upstash Redis $0-5, min-instance $11-12*
