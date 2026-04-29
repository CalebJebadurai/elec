# Tech Stack Evaluation: Performance, Cost, and Architecture Deep Dive

**Date:** 2026-04-28  
**Analyst:** GitHub Copilot (Senior Technical Analyst)  
**Subject:** Quantitative backend technology stack comparison for the Indian election analytics platform  
**Prior Research:** [2026-04-27-elec-platform-improvement-research.md](2026-04-27-elec-platform-improvement-research.md)  
**Refined Prompt:** [2026-04-28-tech-stack-evaluation-refined-prompt.md](2026-04-28-tech-stack-evaluation-refined-prompt.md)

---

## Codebase Findings

### Current Architecture Summary

The backend is a Python 3.12 FastAPI application running on uvicorn with 2 workers (configurable via `WEB_CONCURRENCY` environment variable), as specified in the Dockerfile CMD at [api/Dockerfile](../../api/Dockerfile) line 12. Database access uses asyncpg with raw SQL queries — no ORM layer — against a PostgreSQL database containing a single `tcpd_ae` table with 574,000 rows and 48 columns. Connection pooling is configured with 2–10 connections via `DB_POOL_MIN_SIZE` and `DB_POOL_MAX_SIZE` in [api/database.py](../../api/database.py).

The caching layer in [api/cache.py](../../api/cache.py) implements Redis-backed caching with an in-memory dict fallback. Response caching uses a 5-minute TTL for standard endpoints and a 1-hour TTL for national aggregation queries. The national routes in [api/national_routes.py](../../api/national_routes.py) still use their own in-memory dict cache (`_NATIONAL_CACHE`) independently of the Redis-backed cache module, meaning these expensive query results are per-process and lost on restart.

Rate limiting in [api/main.py](../../api/main.py) uses a dual approach: Redis-backed sorted-set rate limiting (via `_redis_rate_check`) with in-memory dict fallback. The Redis path is attempted first; if unavailable, the in-memory store is used. The Dockerfile runs uvicorn with `--workers 2`, meaning 2 separate Python processes, each with their own in-memory fallback stores.

The API surface consists of approximately 25 endpoints across [api/routes.py](../../api/routes.py) (state-level data: states, elections, years, parties, constituencies, districts, candidates, stats, swings, prediction data), [api/national_routes.py](../../api/national_routes.py) (cross-state aggregations: state summary, party strength, turnout trends, upcoming elections, state comparison), [api/auth_routes.py](../../api/auth_routes.py) (Firebase phone OTP verification, JWT issuance), [api/bookmark_routes.py](../../api/bookmark_routes.py) (CRUD + voting on community predictions), [api/payment_routes.py](../../api/payment_routes.py) (Razorpay subscription management), [api/export_routes.py](../../api/export_routes.py) (CSV export), [api/apikey_routes.py](../../api/apikey_routes.py) (API key management), [api/admin_routes.py](../../api/admin_routes.py) (admin data seeding), and [api/og_routes.py](../../api/og_routes.py) (Open Graph image generation).

JSON serialization uses FastAPI's default Pydantic v2 model serialization. The `_row_to_election` helper in [api/routes.py](../../api/routes.py) converts every asyncpg `Record` to an `Election` Pydantic model with all 48 fields. GZip compression middleware is applied globally in [api/main.py](../../api/main.py).

### Query Complexity Profile

The endpoints fall into three performance tiers based on query complexity:

**Tier 1 — Simple indexed lookups (sub-10ms expected):** `/states` (cached), `/years` (GROUP BY on indexed column), `/constituencies` (DISTINCT on indexed columns), `/districts` (GROUP BY on indexed columns), `/elections/{id}` (primary key lookup). These queries use the composite indexes on `(state_name, year)`, `(state_name, constituency_name, year)`, and `(state_name, election_type)`.

**Tier 2 — Filtered scans with moderate result sets (10–100ms expected):** `/elections` (paginated with WHERE clause on indexed columns, returns up to 500 rows), `/elections/{year}/results` (position=1 filter on indexed year+state), `/swings/constituency/{name}` (multi-year constituency history), `/candidates` (ILIKE search using trigram index).

**Tier 3 — Complex national aggregations (500ms–5s expected):** `/national/state-summary` (5 CTEs joining latest years, winners, turnout, and electors across all states), `/national/party-strength` (full-table scan filtered by position=1, with party normalization and re-query for state counts), `/national/compare` (parallel stats computation for two states). These queries are cached with 1-hour TTL, meaning the database hit occurs at most once per hour per unique parameter combination.

---

## 1. Python FastAPI Performance Ceiling

### TechEmpower Round 22 Benchmark Data (Published October 2023)

TechEmpower Framework Benchmarks Round 22 provides the most authoritative cross-language comparison for database-backed web frameworks, using identical hardware (Dell R440 with 28 physical cores, 32GB RAM, PostgreSQL on a separate identical machine). The "single query" test — fetching one row by primary key from PostgreSQL and serializing as JSON — is the closest proxy to this application's Tier 1 endpoints. All numbers below are requests per second on the dedicated benchmark hardware.

**Python frameworks with PostgreSQL (raw SQL, no ORM):**
- `uvicorn` (bare ASGI + asyncpg): 105,132 req/s
- `blacksheep` (ASGI framework + asyncpg): 91,185 req/s
- `granian [rsgi]` (Rust-based ASGI server): 89,363 req/s
- `starlette` (ASGI framework): 74,914 req/s
- `fastapi-gunicorn-orjson` (FastAPI + Gunicorn + orjson): 72,724 req/s
- `fastapi` (Gunicorn workers): 71,309 req/s
- `fastapi-uvicorn-orjson` (FastAPI + uvicorn + orjson): 66,443 req/s
- `fastapi-uvicorn` (FastAPI + uvicorn, default JSON): 65,723 req/s
- `aiohttp-pg-raw` (aiohttp + asyncpg): 59,144 req/s

**Go frameworks with PostgreSQL (raw SQL):**
- `go-pgx-prefork` (raw Go + pgx, prefork): 278,002 req/s
- `go-pgx` (raw Go + pgx): 253,419 req/s
- `gin` (Gin framework + MySQL, closest Pg proxy): 185,337 req/s
- `echo` (Echo framework + PostgreSQL): 180,455 req/s
- `fiber` (Fiber framework): 313,414 req/s
- `fasthttp` (raw fasthttp): 331,733 req/s

**Node.js frameworks with PostgreSQL:**
- `fastify-postgres` (Fastify + pg): 73,701 req/s
- `nodejs-postgres` (raw Node.js + pg): 62,717 req/s
- `express-postgres` (Express + pg): 37,488 req/s
- `nestjs-fastify` (NestJS on Fastify): 60,831 req/s
- `koa-postgres` (Koa + pg): 54,531 req/s

### Performance Ratios

On identical hardware with raw SQL and PostgreSQL:
- **Go (pgx) vs FastAPI (uvicorn):** Go is approximately 3.8–4.2x faster
- **Go (Gin/Echo) vs FastAPI:** Go frameworks are approximately 2.5–2.7x faster
- **Node.js (Fastify) vs FastAPI:** Fastify is approximately 1.05–1.12x faster (essentially equivalent)
- **Node.js (Express) vs FastAPI:** Express is approximately 0.57x (slower than FastAPI)
- **FastAPI with orjson vs default:** orjson provides approximately 1.0–1.1x improvement (marginal in DB-bound tests)
- **Bare uvicorn vs FastAPI:** removing the FastAPI framework layer provides approximately 1.6x improvement

### Real-World Throughput on Small VMs

TechEmpower uses 28 physical cores. For a realistic 2 vCPU shared VM (the kind available on Railway, Fly.io, or DigitalOcean at $5–$12/month), throughput scales roughly by available CPU cores. A reasonable estimation method is to divide by ~14 (28 cores / 2 vCPU) and apply a shared-CPU penalty of ~0.7x:

**Estimated throughput on a 2 vCPU shared VM (single DB query endpoint):**
- FastAPI + uvicorn (2 workers): ~3,300–4,700 req/s
- Go + pgx: ~12,600–19,800 req/s
- Node.js + Fastify: ~3,700–5,300 req/s

**With Redis cache (cache hit, no DB query):**
When responses are served from Redis cache, the bottleneck shifts to network I/O, JSON deserialization from Redis, and HTTP response assembly. In this scenario, all three languages converge significantly because the limiting factor is no longer CPU-bound processing but I/O-bound Redis roundtrips (~0.1–0.5ms per GET) and network transmission. Estimated cache-hit throughput on a 2 vCPU VM:
- FastAPI + Redis: ~5,000–8,000 req/s
- Go + Redis: ~15,000–25,000 req/s
- Node.js + Redis: ~6,000–10,000 req/s

**The critical insight:** This application's target is 200 req/s at peak (50K MAU election spike). FastAPI on a single 2 vCPU VM can handle ~3,300+ req/s for simple queries and ~5,000+ req/s for cached responses. The target throughput represents approximately 4–6% of FastAPI's capacity on a small VM. Performance is not a bottleneck at the required scale.

### uvicorn Worker Scaling

The Dockerfile currently uses `--workers 2`. Each uvicorn worker is a separate Python process with its own event loop, asyncpg connection pool, and in-memory caches. With `uvloop` installed (present in requirements.txt), uvicorn uses the Cython-based event loop that provides ~2x improvement over the default asyncio loop.

Worker count optimization for different VM sizes:
- 1 vCPU: 1–2 workers (2 workers for I/O-bound workloads)
- 2 vCPU: 2–4 workers
- 4 vCPU: 4–8 workers

Each worker maintains its own asyncpg connection pool (2–10 connections), so with 4 workers the total DB connections would be 8–40. For a managed PostgreSQL instance with 100 connection limit, this is well within bounds but should be monitored. PgBouncer or connection pooling at the database level becomes relevant at 4+ workers.

---

## 2. Hosting Cost Comparison at Three Traffic Levels

### Traffic Level Definitions

**Level 1 — Baseline (1K MAU):**
- 50,000 API requests/month
- ~1.7K requests/day, ~0.02 req/s average
- Can tolerate cold starts
- Expected bandwidth: ~5 GB/month

**Level 2 — Moderate Growth (10K MAU):**
- 500,000 API requests/month
- ~17K requests/day, ~0.2 req/s average, ~2 req/s peak
- Should not have cold starts during business hours
- Expected bandwidth: ~50 GB/month

**Level 3 — Election Spike (50K MAU):**
- 5,000,000 requests over 3 days
- ~1.7M requests/day, ~20 req/s average, ~200 req/s peak
- Zero tolerance for cold starts or degradation
- Expected bandwidth: ~150 GB over 3 days

### Cost Model (API Backend Only, Excluding Database and Frontend)

#### Railway

Railway pricing: $0.000386/GB/s for RAM, $0.000772/vCPU/s for CPU. Hobby plan includes $5 credit with $5/mo minimum; Pro plan includes $20 credit with $20/mo minimum.

A 1 vCPU / 512MB service running 24/7 for a month:
- CPU: 1 vCPU × 2,592,000 seconds × $0.000772/vCPU/s = ~$2.00/mo (note: Railway only charges for *used* CPU, not allocated, so idle apps cost near $0)
- RAM: 0.5 GB × 2,592,000 seconds × $0.000386/GB/s = ~$0.50/mo
- Total: ~$2.50/mo for an idle app, but CPU spikes during requests

Railway's usage-based model means cost scales with actual CPU usage, not provisioned capacity. For a low-traffic Python app, actual CPU usage is a small fraction of wall time.

| Traffic Level | Estimated Compute | Egress Cost | Total Monthly |
|---|---|---|---|
| 1K MAU | ~$2–4 (within $5 Hobby credit) | ~$0.25 (5GB × $0.05) | **~$0** (covered by $5 credit) |
| 10K MAU | ~$5–10 | ~$2.50 (50GB × $0.05) | **~$8–13** |
| 50K MAU (3-day spike) | ~$8–15 (spike amortized over month) | ~$7.50 (150GB × $0.05) | **~$15–23** |

**Assessment:** Railway's usage-based pricing is extremely cost-effective for cyclical workloads. The application pays near-zero during quiet periods and scales cost with actual election-season usage. The $5 Hobby plan may cover baseline traffic entirely. For production reliability, Pro ($20/mo) provides more headroom and features.

#### Fly.io

Fly.io pricing: shared-cpu-1x with 512MB = $3.19/month; with 1GB = $5.70/month. Pay-as-you-go with no free tier for new accounts (legacy free tier included 3 VMs).

| Traffic Level | VM Config | VM Cost | Bandwidth | Total Monthly |
|---|---|---|---|---|
| 1K MAU | shared-cpu-1x, 512MB (auto-stop) | ~$1.60 (50% uptime) | ~$0.60 (5GB India @ $0.12/GB) | **~$2.20** |
| 10K MAU | shared-cpu-1x, 1GB (always-on) | ~$5.70 | ~$6.00 (50GB India @ $0.12/GB) | **~$11.70** |
| 50K MAU spike | shared-cpu-2x, 2GB + scale to 2 instances | ~$22.78 × 2 for spike days + base | ~$18 (150GB India @ $0.12/GB) | **~$30–45** |

**Assessment:** Fly.io's India egress pricing ($0.12/GB) is 2.4x more expensive than Railway ($0.05/GB). The auto-stop/auto-start capability (Fly Machines can stop when idle) helps with baseline costs. The Mumbai (asia-south1) region availability is a significant advantage for Indian users — low latency to end users. However, managed Postgres on Fly.io is more expensive (~$82–164/month for production), making it less suitable unless using an external database.

#### Render

Render pricing: Starter plan = $7/month for 512MB/0.5 vCPU; Standard = $25/month for 2GB/1 vCPU. Free plan available but with auto-sleep and 30-day database limit.

| Traffic Level | Plan | Compute | Bandwidth | Redis | Total Monthly |
|---|---|---|---|---|---|
| 1K MAU | Starter ($7) | $7 | ~$0 (5GB within 5GB free) | Free tier (25MB) | **~$7** |
| 10K MAU | Standard ($25) | $25 | ~$6.75 ((50-5)GB × $0.15/GB) | Starter ($10) | **~$41.75** |
| 50K MAU spike | Pro ($85) + autoscale to 2 | ~$170 (during spike month) | ~$21.75 (150GB) | Standard ($32) | **~$224** |

**Assessment:** Render is significantly more expensive than Railway or Fly.io at all traffic levels. The flat monthly pricing means paying full price during zero-traffic months between elections. The managed Postgres (Basic-256MB at $6/month, Basic-1GB at $19/month) is reasonably priced but adds to the total. Render's bandwidth pricing ($0.15/GB beyond 5GB free) is the highest of all providers evaluated.

#### DigitalOcean App Platform

DigitalOcean pricing: Shared 1 vCPU/1GB = $12/month; Shared 2 vCPU/4GB = $50/month. $7/month for development database.

| Traffic Level | Plan | Compute | Bandwidth | DB | Total Monthly |
|---|---|---|---|---|---|
| 1K MAU | Shared 1vCPU/512MB ($5) | $5 | ~$0 (within allowance) | Dev DB ($7) | **~$12** |
| 10K MAU | Shared 1vCPU/1GB ($12) | $12 | ~$1 (outbound surplus) | Dev DB ($7) | **~$20** |
| 50K MAU spike | Shared 2vCPU/4GB ($50) | $50 | ~$3 | Dev DB ($7) | **~$60** |

**Assessment:** DigitalOcean offers reasonable mid-range pricing. The App Platform auto-scaling requires paid instances. No auto-sleep capability. The development database ($7/month, 512MB) is sufficient for 574K rows. Straightforward, no surprises. Bandwidth is generous.

#### GCP Cloud Run

Cloud Run pricing (asia-south1, Mumbai): $0.000024/vCPU-second active, $0.0000025/GiB-second active. Request-based billing mode. Free tier: 180,000 vCPU-seconds, 360,000 GiB-seconds, 2M requests/month.

Existing Terraform configuration in [infra/terraform/](../../infra/terraform/) already provisions GCP infrastructure, though it targets Compute Engine rather than Cloud Run.

| Traffic Level | vCPU-seconds | GiB-seconds | Request Cost | Total Monthly |
|---|---|---|---|---|
| 1K MAU (50K req, 100ms avg) | 5,000 (within free tier) | 2,500 (within free tier) | $0 (within 2M free) | **~$0** |
| 10K MAU (500K req, 100ms avg) | 50,000 | 25,000 | $0 (within 2M free) | **~$0.74** |
| 50K MAU (5M req/3 days, 200ms avg) | 1,000,000 | 500,000 | $1.20 (3M excess × $0.40/M) | **~$25.40** |

**Assessment:** Cloud Run is extraordinarily cheap for this workload because of request-based billing — the application only pays for actual compute time, not idle time. The free tier covers the entire baseline workload. For the election spike, Cloud Run auto-scales to handle 200 req/s without any configuration. The primary concern is cold start latency: Python containers on Cloud Run have cold starts of 2–10 seconds, which violates the <500ms latency target. Setting `min-instances=1` eliminates cold starts but adds ~$11.60/month in idle cost (1 vCPU, 512MB always-on). Cloud SQL for PostgreSQL in asia-south1 starts at ~$8.50/month (db-f1-micro, shared core, 614MB RAM), which is sufficient for 574K rows. Total with always-warm instance and Cloud SQL: ~$20–35/month at peak.

#### VPS Self-Hosted (Hetzner / DigitalOcean Droplet)

Hetzner Cloud CX23 (shared, 2 vCPU, 4GB RAM, 40GB SSD, 20TB traffic): €3.99/month (~$4.35/month). Available in Germany, Finland, US, Singapore — no India region.

DigitalOcean Droplet (shared, 1 vCPU, 1GB RAM): $6/month. Also available in Bangalore (BLR1) region.

Hetzner CAX11 (ARM, 2 vCPU, 4GB RAM, 40GB SSD): €3.79/month (~$4.13/month).

| Traffic Level | Hetzner CX23 | DO Droplet (1GB) | DO Droplet (2GB) |
|---|---|---|---|
| 1K MAU | **~$4.35** | **~$6** | **~$12** |
| 10K MAU | **~$4.35** (same VM) | **~$6** | **~$12** |
| 50K MAU spike | **~$4.35** (same VM handles it) | **~$12** (upgrade) | **~$12** |

Self-hosted requires installing and managing: PostgreSQL, Redis, SSL certificates (Let's Encrypt + certbot), reverse proxy (nginx/caddy), process manager (systemd), monitoring (manual setup of Sentry, UptimeRobot), backups (pg_dump cron job), and security updates. Estimated setup time: 4–8 hours. Ongoing maintenance: 1–2 hours/month.

**Assessment:** VPS is by far the cheapest option at every traffic level. A Hetzner CX23 at €3.99/month can run the API, PostgreSQL, and Redis all on one machine and still have capacity for 200 req/s. The 574K-row database fits comfortably in 4GB RAM as PostgreSQL shared_buffers. The tradeoff is operational burden: no auto-scaling (must manually resize during spikes), no managed database backups, no zero-downtime deploys without additional tooling (would need Docker + Watchtower or similar). A DigitalOcean Droplet in Bangalore provides Indian-region latency at $6/month. The DigitalOcean Droplet approach offers a middle ground — a managed VPS with their monitoring dashboard but manual application management.

### Cost Comparison Summary Table

| Provider | 1K MAU | 10K MAU | 50K MAU Spike | Auto-scale | Indian Region | Cold Start |
|---|---|---|---|---|---|---|
| **Railway Hobby** | ~$0 | ~$8–13 | ~$15–23 | Manual replicas | No | Container restart |
| **Fly.io** | ~$2 | ~$12 | ~$30–45 | Auto-stop/start | Mumbai ✓ | ~2s (Machine start) |
| **Render Starter** | ~$7 | ~$42 | ~$224 | Horizontal auto | Singapore | ~5–15s (free), 0 (paid) |
| **DO App Platform** | ~$12 | ~$20 | ~$60 | CPU-based auto | Bangalore ✓ | None (always-on) |
| **GCP Cloud Run** | ~$0 | ~$1 | ~$25 | Fully automatic | Mumbai ✓ | 2–10s (Python cold) |
| **Hetzner VPS** | ~$4 | ~$4 | ~$4 | None (manual) | No (EU/US/SG) | None (always-on) |
| **DO Droplet** | ~$6 | ~$6–12 | ~$12 | None (manual) | Bangalore ✓ | None (always-on) |

---

## 3. Database Alternatives Assessment

### Is PostgreSQL the Bottleneck?

Based on the codebase analysis, PostgreSQL is demonstrably **not** the bottleneck for this application's workload. The evidence:

**Dataset size:** 574,000 rows × 48 columns in a single table. At approximately 1KB per row (estimated from column types: mostly TEXT, INTEGER, NUMERIC), the entire dataset is approximately 550MB. PostgreSQL's `shared_buffers` default of 128MB can cache the hot working set (indexes + frequently accessed rows), and a machine with 1GB+ RAM can hold the entire dataset in the OS page cache after a warm-up period.

**Index coverage:** The schema in [init.sql](../../init.sql) defines 12 indexes covering all major query access patterns. The composite indexes on `(state_name, year)`, `(state_name, constituency_name, year)`, and `(state_name, year, position)` match the most common WHERE clause combinations. Index-only scans are possible for many queries.

**Query execution times (estimated for warm cache):**
- Tier 1 queries (indexed lookups): 0.5–5ms
- Tier 2 queries (filtered scans with 100–500 rows): 5–50ms
- Tier 3 queries (national aggregations with CTEs): 200ms–2s (first execution), then cached for 1 hour

**Cache effectiveness:** With Redis caching at 5-minute TTL for standard endpoints and 1-hour TTL for national aggregations, the vast majority of requests during an election traffic spike would hit cache. If 1,000 concurrent users are viewing Tamil Nadu 2026 results, they all receive the same cached response — the database is queried once, and subsequent requests for 5 minutes are served from Redis. During a 3-day election spike, the actual database query volume would be a tiny fraction of total request volume.

**Growth trajectory:** The dataset grows by ~10,000–30,000 rows per year (new elections). At this rate, the database will reach ~800,000 rows in 2 years and ~1 million rows in 4 years. PostgreSQL handles tables with millions of rows routinely; the indexes and caching patterns already in place are appropriate for 10x growth.

### Alternative Database Technologies

#### SQLite (Embedded, Zero Network Latency)

SQLite eliminates network round-trip latency between the application and database (~0.1–0.5ms per query on localhost, 1–5ms on network). For a read-heavy, single-writer workload with 574K rows, SQLite is a technically viable option.

**Strengths for this workload:** Zero network latency, no separate process to manage, no connection pooling needed, entire database in a single file (~550MB) that can be included in the Docker image or volume, WAL mode supports concurrent readers. The dataset is small enough that SQLite's single-file approach works well.

**Weaknesses:** SQLite's single-writer lock means any write operation (bookmark creation, user registration, API key creation) blocks all other writes. With asyncpg, the current codebase benefits from PostgreSQL's MVCC and concurrent write capability. Migrating 25+ endpoints from asyncpg parameterized queries to SQLite's `aiosqlite` interface requires rewriting every database access call. SQLite lacks some PostgreSQL-specific features used in the codebase: `pg_trgm` for trigram search (candidate name ILIKE), `ARRAY_AGG` (used extensively in national routes), and `COPY FROM` for bulk data loading. Deploying SQLite in a containerized environment requires persistent volume storage, which adds complexity on Railway/Fly.io and prevents easy horizontal scaling (each instance would need its own copy of the database).

**Assessment:** The network latency savings (~0.5ms per query) are insignificant compared to query execution time and response serialization time. The migration effort and loss of concurrent writes make this a poor tradeoff.

#### Turso (Distributed SQLite)

Turso provides managed, globally-distributed SQLite with edge read replicas. Pricing: Free tier (500 databases, 9GB storage, 25M reads/month), Scaler ($29/month, 100M reads/month), Enterprise (custom).

**Strengths:** Edge read replicas in regions close to Indian users would provide sub-5ms read latency. The libSQL wire protocol is compatible with SQLite. No connection pooling management needed. The free tier (25M reads/month) covers the 50K MAU election spike entirely.

**Weaknesses:** Same write-model limitations as SQLite (single primary writer). Requires rewriting all database access code from asyncpg to Turso's HTTP or WebSocket client. No Python async client with the maturity of asyncpg. The platform has minimal complex query needs that would benefit from edge distribution — the data is the same everywhere, so CDN-cached API responses achieve the same latency benefit without a database migration. The `ARRAY_AGG` and `pg_trgm` features are unavailable.

**Assessment:** Turso solves a problem (read latency) that is already solved by Redis caching. The migration cost is high with no meaningful benefit for this workload.

#### Supabase (Managed Postgres with Edge Functions)

Supabase provides managed PostgreSQL (same engine as current) with auto-generated REST APIs (PostgREST), real-time subscriptions, and edge functions. Free tier: 500MB database, 2 active projects. Pro: $25/month, 8GB database, daily backups.

**Strengths:** Zero migration cost for the database schema and data — it is PostgreSQL. The PostgREST auto-generated API could replace some of the simpler endpoints (list states, list years, list constituencies) without custom code. Connection pooling via Supavisor is built in. Managed backups and monitoring included.

**Weaknesses:** At $25/month for Pro, it is more expensive than self-hosting PostgreSQL on a VPS or using Railway's managed Postgres. The auto-generated REST API does not support the complex CTEs in national aggregation endpoints, so the FastAPI backend is still needed for those. Edge functions run on Deno, which would require rewriting backend logic in TypeScript — defeating the purpose of staying on the current stack. Connection to Supabase from a Railway-hosted API adds network latency that does not exist with Railway's managed PostgreSQL (same-datacenter communication).

**Assessment:** Supabase is a reasonable managed PostgreSQL provider, but it does not solve any problem that Railway's managed Postgres or a self-hosted PostgreSQL does not already solve. The added cost and potential latency increase make it a lateral move.

### Connection Pooling: PgBouncer vs. asyncpg Built-in

The asyncpg connection pool in [api/database.py](../../api/database.py) is configured with `min_size=2, max_size=10`. With 2 uvicorn workers, total connections are 4–20. Adding PgBouncer between the application and PostgreSQL would:

- Allow more workers/replicas to share a smaller set of database connections
- Enable transaction-mode pooling where connections are returned to the pool after each query rather than being held for the session
- Reduce PostgreSQL backend process count (each connection consumes ~10MB of PostgreSQL memory)

**When PgBouncer matters:** If scaling to 4+ uvicorn workers (8+ API replicas), total connection demand could reach 40–80+, potentially exceeding managed PostgreSQL's connection limit (typically 100 on small instances). PgBouncer's transaction-mode pooling would allow all replicas to share ~20 connections.

**For the current scale:** With 2 workers and 4–20 connections, PgBouncer adds complexity with no meaningful benefit. The asyncpg pool is already connection-efficient and supports prepared statements (which PgBouncer in transaction mode does not).

### Read Replicas

PostgreSQL read replicas would split read traffic across multiple database instances. For this workload:

- All queries are reads (election data is write-once), except bookmarks and user management
- A single PostgreSQL instance handles 574K rows with no measured performance issues
- Redis caching already reduces database query frequency dramatically

**Assessment:** Read replicas add cost ($6–8/month per replica on Railway/Render) and replication lag complexity without solving any observed bottleneck. They become relevant only if the database is provably the bottleneck at scale, which current evidence does not support.

### Database Assessment Summary

PostgreSQL is the correct database for this workload. The 574K-row dataset is well within PostgreSQL's comfort zone, the indexes are appropriately designed, and Redis caching effectively eliminates repeated queries. Investing in PgBouncer, read replicas, or alternative databases would be premature optimization. The single most impactful database optimization available is ensuring the national aggregation endpoints in [api/national_routes.py](../../api/national_routes.py) use the Redis-backed cache from [api/cache.py](../../api/cache.py) instead of their own in-memory dict cache (`_NATIONAL_CACHE`), which is lost on process restart and not shared across workers.

---

## 4. Go vs Node.js vs Python — Realistic Solo Developer Assessment

### Rewrite Effort Estimation

The API surface consists of approximately 25 endpoints across 8 route files, plus middleware for rate limiting, CORS, CSP headers, GZip, and body size limiting. Total Python backend code (excluding tests, alembic, and generated files) is approximately 2,500–3,000 lines.

**Rewriting to Go:**

- **Endpoint reimplementation (20+ endpoints):** Each endpoint requires translating asyncpg parameterized queries to pgx parameterized queries (similar syntax), translating Pydantic response models to Go structs with JSON tags, and translating FastAPI dependency injection (auth, rate limiting) to middleware patterns. Estimated: 2–3 days per complex endpoint (national aggregations), 0.5–1 day per simple endpoint. Total: ~25–40 developer-days.

- **Firebase Admin SDK:** The `firebase-admin` Python package is the official SDK. The Go Firebase Admin SDK is officially maintained by Google (`firebase.google.com/go/v4`). Token verification is supported, so this is a straightforward port. Estimated: 2–3 days.

- **Razorpay integration:** Razorpay provides official SDKs for Python and Node.js but **not Go**. The Go integration would require building a Razorpay HTTP client from scratch using their REST API documentation, handling webhook signature verification manually, and building subscription lifecycle management without SDK abstractions. Estimated: 5–7 days.

- **Redis caching layer:** Go has mature Redis clients (`go-redis/redis`). The caching pattern in [api/cache.py](../../api/cache.py) would port directly. Estimated: 1–2 days.

- **Rate limiting middleware:** Go has `golang.org/x/time/rate` and the in-memory + Redis hybrid approach would port directly. Estimated: 1–2 days.

- **Testing:** Writing equivalent tests in Go requires learning Go's `testing` package and testify assertions, plus setting up test database fixtures. Estimated: 5–10 days.

- **Deployment configuration:** New Dockerfile, Railway/Fly.io configuration. Estimated: 1 day.

- **Learning curve:** For a developer with "basic familiarity with Go but has never built a production application in Go," there is a significant learning curve around Go's error handling patterns, interface design, goroutine/channel patterns, and dependency management. This adds latency to every task above. Estimated overhead: 30–50% additional time.

**Total Go rewrite estimate: 8–12 weeks of full-time work.**

**Rewriting to Node.js (TypeScript + Fastify):**

- **Endpoint reimplementation:** Fastify's routing and validation (via JSON Schema or Zod) is conceptually similar to FastAPI. The `pg` library for PostgreSQL uses parameterized queries with similar syntax to asyncpg. TypeScript types replace Pydantic models. Estimated: 1–2 days per complex endpoint, 0.5 day per simple endpoint. Total: ~15–25 developer-days.

- **Firebase Admin SDK:** Official Node.js SDK (`firebase-admin`). Direct equivalent of the Python SDK. Estimated: 1–2 days.

- **Razorpay integration:** Official Node.js SDK (`razorpay`). Direct equivalent of the Python SDK. Estimated: 1–2 days.

- **Redis caching layer:** `ioredis` is the standard Node.js Redis client. Direct port. Estimated: 1 day.

- **Testing:** Vitest or Jest with supertest. The developer already uses vitest for frontend testing. Estimated: 3–5 days.

- **Deployment:** New Dockerfile. Estimated: 0.5 days.

- **Learning curve:** The developer has "moderate familiarity with Node.js." TypeScript adds type safety but also a learning curve for advanced patterns (generics, mapped types). Estimated overhead: 15–25%.

**Total Node.js rewrite estimate: 5–8 weeks of full-time work.**

### Performance Gain After Redis Caching

With Redis caching in place (5-minute TTL for standard endpoints, 1-hour for national), the majority of requests during an election spike are cache hits. The performance comparison for cache hits:

**Cache hit path:** Receive HTTP request → parse route → check auth JWT (decode + verify) → Redis GET → deserialize JSON → build HTTP response → GZip compress → send.

In this path, the dominant costs are:
1. JWT verification: HMAC-SHA256 computation (~0.01ms in any language)
2. Redis GET: ~0.1–0.5ms (network round-trip)
3. JSON deserialization: varies by language and library
4. GZip compression: CPU-bound, Go is faster
5. HTTP response assembly: minimal

For a cached response of ~50KB (typical state results page):
- Python (FastAPI + orjson): ~2–5ms total per request
- Go (Gin + encoding/json): ~0.5–2ms total per request
- Node.js (Fastify): ~1–3ms total per request

**The performance difference for cache hits is 1–4ms.** This is invisible to end users (total response time including network is 50–200ms). The latency difference between languages is entirely within the noise floor of network variability.

**For cache misses (Tier 3 queries):** The database query itself takes 200ms–2s. The language runtime adds:
- Python: ~5–20ms for serialization of 500 rows
- Go: ~1–5ms
- Node.js: ~3–10ms

Against a 200ms+ database query, the 5–15ms language overhead represents 2.5–7.5% of total response time. This is not a meaningful difference.

### Where the Bottleneck Actually Is

For this application, the bottleneck hierarchy is:
1. **PostgreSQL query time for complex national aggregations** (200ms–2s) — addressed by caching
2. **Network latency between user and server** (50–200ms depending on region) — addressed by regional deployment
3. **JSON serialization of large result sets** (5–20ms for 500 rows in Python) — addressable with orjson
4. **Container cold start time** (2–10s for Python on serverless) — addressed by min instances
5. **Language runtime overhead** (1–5ms difference between Go and Python) — irrelevant at target scale

### SDK Availability Comparison

| Dependency | Python | Node.js | Go |
|---|---|---|---|
| Firebase Admin SDK | ✓ Official (`firebase-admin`) | ✓ Official (`firebase-admin`) | ✓ Official (`firebase.google.com/go/v4`) |
| Razorpay SDK | ✓ Official (`razorpay`) | ✓ Official (`razorpay`) | ✗ No official SDK (HTTP only) |
| asyncpg / pg driver | ✓ `asyncpg` (async, fast) | ✓ `pg` (callback/promise) | ✓ `pgx` (native, fast) |
| Redis client | ✓ `redis[hiredis]` (async) | ✓ `ioredis` (async) | ✓ `go-redis/redis` |
| JWT library | ✓ `PyJWT` | ✓ `jsonwebtoken` | ✓ `golang-jwt/jwt` |
| HTTP client | ✓ `httpx` (async) | ✓ `axios`/`node-fetch` | ✓ `net/http` (stdlib) |
| Testing framework | ✓ `pytest` + `pytest-asyncio` | ✓ `vitest`/`jest` | ✓ `testing` (stdlib) |
| Sentry SDK | ✓ Official | ✓ Official | ✓ Official |
| Alembic/migrations | ✓ `alembic` | ✓ `knex`/`prisma migrate` | ✓ `golang-migrate/migrate` |

The Razorpay SDK gap in Go is the most significant practical concern. Building webhook signature verification from scratch is error-prone and lacks the SDK's built-in retry logic, idempotency key management, and subscription lifecycle helpers.

---

## 5. The "Optimize Current Stack" Path

### Specific Optimizations and Their Expected Impact

#### 1. orjson for JSON Serialization

Replace FastAPI's default JSON serialization with orjson (a Rust-based JSON serializer for Python). orjson is 3–10x faster than Python's standard `json` module for serialization and 2–5x faster for deserialization.

**Implementation:** Add `orjson` to requirements.txt, configure FastAPI to use `ORJSONResponse` as default response class.

```python
from fastapi.responses import ORJSONResponse
app = FastAPI(default_response_class=ORJSONResponse)
```

**Expected impact:** TechEmpower shows `fastapi-uvicorn-orjson` at 66,443 req/s vs `fastapi-uvicorn` at 65,723 req/s — a mere 1% improvement in DB-bound tests. However, for endpoints returning large result sets (500 rows × 48 fields), the serialization savings are more significant. Estimated 5–15ms savings per large response. For small responses (states list, year list), negligible.

**Effort:** 15 minutes.

#### 2. Connection Pool Tuning

The current pool configuration (`min_size=2, max_size=10`) is reasonable for 2 workers. Tuning considerations:

- Increase `max_size` to match the expected concurrent database queries per worker. With async I/O, a single worker can have many concurrent queries in flight.
- For 2 workers: `min_size=2, max_size=15` per worker (30 total) provides headroom for concurrent national aggregation queries.
- Add `server_settings={'jit': 'off'}` to disable PostgreSQL JIT compilation, which adds planning overhead for small queries and is only beneficial for complex analytical queries running >100ms. The national aggregation queries might benefit from JIT, but they are cached for 1 hour.

**Expected impact:** Eliminates connection exhaustion under concurrent load. Connection acquisition wait time drops to near-zero. Estimated 1–5ms savings per query that was previously waiting for a connection.

**Effort:** 30 minutes.

#### 3. Migrate National Routes to Redis-Backed Cache

The national routes in [api/national_routes.py](../../api/national_routes.py) use `_NATIONAL_CACHE` (in-memory dict with 1-hour TTL) instead of the Redis-backed cache in [api/cache.py](../../api/cache.py). This means:
- Cache is lost on every process restart (Railway restarts, deployments)
- Cache is per-worker (with 2 workers, the same query is executed and cached independently by each worker)
- Cache is lost if the process crashes

Migrating to Redis-backed caching with the existing `get_cached`/`set_cached` functions from [api/cache.py](../../api/cache.py) would provide persistent, shared caching.

**Expected impact:** Eliminates cold-start penalty for the most expensive queries (national state summary: 500ms–2s). After any single request triggers the query, all subsequent requests across all workers and all restarts within the 1-hour TTL hit Redis (~0.2ms).

**Effort:** 1–2 hours.

#### 4. Response Model Slimming

The `_row_to_election` helper returns all 48 columns for every record. List endpoints like `/elections` return up to 500 records, each with 48 fields. Many fields (e.g., `pid`, `party_id`, `tcpd_prof_main_desc`, `tcpd_prof_second`, `tcpd_prof_second_desc`, `last_party_id`, `last_constituency_name`) are unused by the frontend.

Creating a lightweight response model with only the ~15 fields needed for list views would reduce:
- JSON serialization time: ~3x fewer fields to serialize
- Network transfer: ~3x smaller response payload
- GZip compression CPU: proportionally less data to compress

**Expected impact:** Response size reduction from ~500KB to ~170KB for a 500-row page. Serialization time reduction of ~60%. Combined with GZip, network transfer savings of 40–60%.

**Effort:** 2–4 hours (create `ElectionSummary` model, add `SELECT` column lists to queries, keep full model for `/elections/{id}`).

#### 5. Materialized Views for National Aggregations

The national state summary and party strength queries execute complex CTEs across 574K rows. Creating materialized views that pre-compute these results would reduce query time from 500ms–2s to <5ms (index scan on the materialized view).

Materialized views would be refreshed on a schedule (e.g., every hour via a cron job or after data ingestion) since the underlying election data changes only during data loads.

**Implementation:** `CREATE MATERIALIZED VIEW national_state_summary AS (...)` with the CTE from the `/national/state-summary` endpoint. Add `REFRESH MATERIALIZED VIEW CONCURRENTLY` to the data ingestion pipeline.

**Expected impact:** First-request latency for national endpoints drops from 500ms–2s to <5ms. Combined with Redis caching, subsequent requests are served at ~0.2ms.

**Effort:** 3–5 hours (create views, add Alembic migration, add refresh trigger).

#### 6. PgBouncer

Adding PgBouncer in transaction-mode pooling between the application and PostgreSQL. Relevant only when scaling beyond 2–4 workers.

**When needed:** At 4+ workers with `max_size=15` each, total connections reach 60+. Managed PostgreSQL instances often cap at 100–200 connections. PgBouncer allows all workers to share a pool of 20–30 actual database connections.

**Expected impact at current scale:** None. With 2 workers and 4–20 connections, PgBouncer adds latency (~0.1ms per query for pool management) with no benefit.

**Effort:** 2–4 hours (deploy PgBouncer container, configure connection strings, handle prepared statement incompatibility).

#### 7. uvicorn Worker Count Optimization

The current Dockerfile sets `WEB_CONCURRENCY=2`. For a CPU-bound workload, optimal worker count is `2 × CPU_COUNT + 1`. For an I/O-bound workload (database queries, Redis, network), higher counts work because workers spend most time waiting.

On a 2 vCPU VM: 4 workers would be optimal (2 × 2 = 4). On a 1 vCPU: 2 workers (current setting is appropriate).

**Expected impact:** Doubling workers from 2 to 4 approximately doubles throughput for I/O-bound endpoints, at the cost of doubling memory usage and database connections.

**Effort:** Change one environment variable.

#### 8. Query Optimization: Selective Column Fetching

All queries use `SELECT *` which fetches all 48 columns. For most endpoints, only 10–15 columns are needed. Changing to explicit column lists reduces:
- Data transfer between PostgreSQL and the application
- asyncpg row parsing overhead
- Pydantic model construction time (though `**dict(row)` will error for missing fields, requiring model adjustment)

**Expected impact:** 30–50% reduction in data transfer from PostgreSQL, 20–40% reduction in row parsing time. For a 500-row query, estimated savings of 5–15ms.

**Effort:** 3–6 hours (update all queries with explicit column lists, update Pydantic models to make unused fields Optional).

### Optimization Impact Summary

| Optimization | Expected Latency Savings | Effort | Priority |
|---|---|---|---|
| Migrate national cache to Redis | 500ms–2s (cold start) | 1–2 hours | **Critical** |
| orjson response class | 5–15ms (large responses) | 15 minutes | **Quick win** |
| Response model slimming | 10–30ms (large lists) | 2–4 hours | **High** |
| Selective column fetching | 5–15ms (large lists) | 3–6 hours | **Medium** |
| Connection pool tuning | 1–5ms (under concurrency) | 30 minutes | **Quick win** |
| Materialized views | 500ms–2s → <5ms (first request) | 3–5 hours | **Medium** |
| Worker count increase (2→4) | 2x throughput | 5 minutes | **Quick win** |
| PgBouncer | 0ms (at current scale) | 2–4 hours | **Defer** |

**Combined effect of all optimizations:** The optimized FastAPI stack on a 2 vCPU VM would achieve:
- Cache hit (95% of requests during spikes): <5ms response time
- Simple indexed query: <15ms response time  
- Complex national aggregation (first request): <20ms (via materialized view) or <500ms (via Redis cache miss but optimized query)
- Throughput: 4,000–8,000 req/s (with 4 workers, cached responses)

This exceeds the target of 200 req/s / <500ms p95 by a factor of 20–40x.

---

## 6. Cost-Performance Sweet Spot

### Scenario: 200 req/s with <500ms p95 Latency Using Python/FastAPI

#### Option A: Hetzner CX23 + Self-Managed (~$5/month)

- **Server:** Hetzner CX23, 2 vCPU, 4GB RAM, €3.99/month
- **Stack:** Docker Compose with FastAPI (4 workers) + PostgreSQL + Redis, all on one machine
- **Performance:** 4,000–8,000 req/s for cached responses, 3,300+ req/s for DB queries
- **Latency:** <5ms for cache hits, <50ms for indexed queries, <500ms for national (with materialized views)
- **Tradeoffs:** No Indian datacenter (closest: Singapore at ~60ms latency to Mumbai), manual SSL/backups/monitoring, no auto-scaling, single point of failure

**Cost:** ~$5/month total. This is the cheapest viable option.

#### Option B: DigitalOcean Droplet in Bangalore (~$12/month)

- **Server:** DO Droplet, 1 vCPU, 2GB RAM, $12/month in Bangalore (BLR1)
- **Stack:** Docker Compose with FastAPI (2 workers) + PostgreSQL + Redis
- **Performance:** 2,000–4,000 req/s for cached responses
- **Latency:** <10ms for cache hits + <30ms network to Indian users
- **Tradeoffs:** Manual management, but Indian region means ~10–30ms latency to end users vs ~60–200ms from EU/US servers

**Cost:** ~$12/month total. Best latency for Indian users at low cost.

#### Option C: Railway Hobby with Redis (~$8–13/month at 10K MAU)

- **Server:** Railway Hobby plan, auto-sizing compute
- **Stack:** FastAPI (2 workers) + Railway managed PostgreSQL + Railway Redis addon
- **Performance:** Depends on allocated resources (Railway scales CPU/RAM with demand)
- **Latency:** Railway's US/EU regions add 150–300ms latency to Indian users
- **Tradeoffs:** Fully managed, zero ops burden, but no Indian region and usage-based pricing means election spikes cost more

**Cost:** ~$5/month idle, ~$13/month at 10K MAU, ~$20–23/month during spikes.

#### Option D: GCP Cloud Run (Mumbai) + Cloud SQL (~$20–35/month)

- **Server:** Cloud Run in asia-south1 (Mumbai), auto-scaling 0→N instances
- **Stack:** FastAPI container + Cloud SQL (db-f1-micro, $8.50/month) + Memorystore Redis ($13/month for 1GB) OR Upstash Redis (free tier)
- **Performance:** Auto-scales to handle any traffic level
- **Latency:** <5ms to Indian users (Mumbai region), 2–10s cold start mitigated by `min-instances=1` (adds ~$12/month)
- **Tradeoffs:** Most complex deployment configuration, requires managing GCP IAM, Cloud SQL proxy, etc. Existing Terraform config provides a starting point.

**Cost:** ~$20–35/month for always-warm + Cloud SQL. Spikes add <$15 for the spike period.

#### Option E: Fly.io in Mumbai (~$12–18/month)

- **Server:** Fly.io shared-cpu-1x, 1GB in Mumbai (maa)
- **Stack:** FastAPI container + Fly Postgres (or external DB) + Upstash Redis (via Fly extension)
- **Performance:** Auto-stop when idle, auto-start on request (~2s start time)
- **Latency:** <5ms to Indian users, 2s cold start if Machine was stopped
- **Tradeoffs:** Bandwidth at $0.12/GB India egress is expensive for high-traffic periods

**Cost:** ~$6–12/month steady, ~$30–45/month during spikes.

### Sweet Spot Recommendation Matrix

| Priority | Recommended Option | Monthly Cost | Why |
|---|---|---|---|
| **Cheapest possible** | Hetzner CX23 | ~$5 | Cheapest compute, but no Indian region |
| **Best latency for Indian users, low budget** | DO Droplet Bangalore | ~$12 | Indian datacenter at lowest managed VPS cost |
| **Zero ops burden** | Railway Hobby | ~$5–23 | Fully managed, pay for what you use |
| **Auto-scaling + Indian region** | GCP Cloud Run Mumbai | ~$20–35 | Best auto-scaling, Indian region, existing Terraform |
| **Balanced (good latency, moderate cost, some ops)** | Fly.io Mumbai | ~$12–18 | Indian region, auto-stop, reasonable pricing |

---

## Architectural Constraints

The following constraints must be respected by any stack decision:

1. **Firebase phone authentication** is deeply integrated into both frontend and backend. The backend verifies Firebase ID tokens in [api/auth_routes.py](../../api/auth_routes.py) and issues platform-specific JWTs. Changing the auth provider would require frontend changes.

2. **Razorpay payment processing** in [api/payment_routes.py](../../api/payment_routes.py) uses the Razorpay Python SDK for subscription management and webhook signature verification. Any backend language change must handle Razorpay integration.

3. **The prediction engine runs entirely client-side** in [frontend/src/engine/predictionEngine.js](../../frontend/src/engine/predictionEngine.js). Backend performance has zero impact on prediction computation. The backend serves historical data for the predictions to operate on.

4. **The frontend is React 19 on Vercel** with its own CDN and deployment pipeline. Backend stack changes do not affect frontend deployment.

5. **Railway deployment** is configured via [railway.toml](../../railway.toml) with Docker build. Any alternative hosting requires updating CI/CD but not application code (Docker is portable).

6. **Single table design** (`tcpd_ae`) with 574K rows and 48 columns. All backend frameworks would query the same database with the same SQL. Performance differences between languages for database-bound operations are marginal.

---

## Edge Cases and Risks

### Election Traffic Spike Behavior

Indian state elections produce extreme traffic patterns: near-zero traffic for months, then 10–50x spikes over 3–5 days during vote counting. The 2026 Tamil Nadu election (April–May) would be the first real stress test. Key risks:

- **Railway auto-scaling:** Railway supports manual replica scaling (up to 5 on Hobby, 42 on Pro) but not automatic traffic-based autoscaling. An election spike requires manual intervention to scale up.
- **Database connection exhaustion:** If scaling to 4+ replicas × 10 connections = 40+ connections, Railway's managed PostgreSQL may hit connection limits. PgBouncer or reducing `max_size` per worker becomes necessary.
- **Cache stampede:** When Redis cache TTL expires during a traffic spike, hundreds of concurrent requests may simultaneously execute the expensive national aggregation query. Mitigation: implement cache-aside with a lock (only one request fetches from DB, others wait for cache population).
- **Cold start during spike:** If the application was idle (Railway free tier sleeps after inactivity), the first election-morning request triggers a cold start (5–15 seconds for container + database connection pool initialization). Mitigation: healthcheck-based warm-up, always-on paid tier.

### Data Integrity During Ingestion

The data ingestion pipeline uses bulk `COPY FROM CSV` via shell scripts in [infra/](../../infra/). During ingestion, the `tcpd_ae` table is being written to while read queries continue. PostgreSQL's MVCC handles this correctly (readers see consistent snapshot), but:
- Cache invalidation is not triggered during data ingestion — stale cache entries serve old data for up to 1 hour (national routes) or 5 minutes (standard routes)
- The `_GENERAL_YEARS_CACHE` in [api/routes.py](../../api/routes.py) never expires, so newly ingested election years are not reflected until the process restarts

### Multi-Worker State Inconsistency

With 2+ uvicorn workers, each worker maintains independent:
- `_GENERAL_YEARS_CACHE` (never expires, different workers may have different data if one restarts)
- `_response_cache` (sync fallback dict, 5-minute TTL but per-process)
- `_NATIONAL_CACHE` (1-hour TTL, per-process)
- `_rate_store` and `_auth_rate_store` (in-memory rate limiting fallback)

If Redis is unavailable, each worker enforces rate limits independently, allowing an attacker to make `RATE_LIMIT_REQUESTS × worker_count` requests per window.

---

## Security Findings

The security posture is mostly adequate for the current scale, with the following observations relevant to stack evaluation:

1. **Rate limiting Redis fallback:** The dual-path rate limiting (Redis primary, in-memory fallback) in [api/main.py](../../api/main.py) is well-designed but the fallback path allows per-worker bypass. Any stack change should preserve the Redis-primary approach and treat in-memory as a degraded mode with alerting.

2. **JWT secret management:** The JWT secret validation in [api/auth.py](../../api/auth.py) refuses placeholder values, which is correct. A Go or Node.js rewrite must replicate this validation.

3. **SQL injection surface:** The `_et_filter()` function returns hardcoded SQL strings interpolated via f-strings. While currently safe (output is controlled), any rewrite should use parameterized queries exclusively — Go's `pgx` and Node.js's `pg` both support parameterized queries natively.

4. **CORS configuration:** The `ALLOWED_ORIGINS` environment variable approach works for any backend language.

5. **SSL certificate handling:** The SSL context configuration in [api/database.py](../../api/database.py) has been improved with configurable verification and CA cert loading. Any stack change must replicate this configuration.

---

## Performance Findings

### Observed vs. Required Performance

**Required:** 200 req/s peak, <500ms p50, <2s p95.

**FastAPI capacity (estimated, 2 vCPU VM, 2 workers, with Redis cache):**
- Cache hit throughput: ~5,000–8,000 req/s
- Cache hit latency: <5ms p50, <15ms p95
- DB query throughput (indexed): ~3,300 req/s
- DB query latency (indexed): <15ms p50, <50ms p95
- National aggregation (cache miss): ~200ms–2s (first request only, then cached)

The current stack, with the optimizations described in Section 5, exceeds the performance requirements by 20–40x for throughput and meets latency targets with comfortable margin.

### Where Each Language Wins

- **Go wins** when: raw throughput is critical (>5,000 req/s sustained), memory efficiency matters (Go uses ~10–30MB per process vs Python's ~50–100MB), cold start time matters (<100ms for Go binary vs 2–10s for Python container), or the deployment target is resource-constrained (IoT, edge, embedded).

- **Node.js wins** when: the developer wants full-stack TypeScript, real-time WebSocket features are central (Node.js event loop handles long-lived connections efficiently), or the ecosystem for a specific integration is Node.js-first.

- **Python/FastAPI wins** when: developer productivity is the priority (the developer is already productive in Python), the workload is I/O-bound with aggressive caching (language runtime overhead is negligible), rapid prototyping is valued (FastAPI's auto-generated OpenAPI docs, Pydantic validation), or the ecosystem for data science integration matters (the datascience/ directory with Jupyter notebooks shares the Python ecosystem).

### Quantified Performance Gap After Optimization

With all Section 5 optimizations applied to the current Python/FastAPI stack:

| Metric | Python/FastAPI (Optimized) | Go (Gin/pgx) | Node.js (Fastify/pg) | Target |
|---|---|---|---|---|
| Cache hit p50 | <3ms | <1ms | <2ms | <500ms |
| Cache hit p95 | <10ms | <3ms | <7ms | <2s |
| DB query p50 | <15ms | <5ms | <10ms | <500ms |
| DB query p95 | <50ms | <15ms | <30ms | <2s |
| National agg (miss) | <500ms (mat. view) | <500ms | <500ms | <2s |
| Max throughput (2 vCPU) | ~6,000 req/s | ~18,000 req/s | ~7,000 req/s | 200 req/s |
| Memory usage | ~100–200MB | ~30–60MB | ~80–150MB | N/A |
| Cold start | 2–5s | 0.1–0.5s | 1–3s | N/A |

All three stacks exceed the target requirements by at least 30x. The performance differences are invisible at the target scale and would only become relevant at >5,000 req/s sustained load — a traffic level that implies millions of MAU, well beyond the 12-month target of 10,000 MAU.

---

## Summary of Key Findings

1. **FastAPI's performance ceiling is not the bottleneck.** At the target scale (200 req/s, 10K MAU), FastAPI on a 2 vCPU VM delivers 20–40x the required throughput. The actual bottleneck is PostgreSQL query time for complex aggregations, which is solved by Redis caching and materialized views regardless of backend language.

2. **The cheapest way to serve the target load with Python/FastAPI** is a Hetzner CX23 at ~$5/month or a DigitalOcean Droplet in Bangalore at ~$12/month, running FastAPI + PostgreSQL + Redis on one machine. For zero-ops management, Railway Hobby at ~$5–13/month or GCP Cloud Run in Mumbai at ~$20–35/month are viable.

3. **A Go rewrite provides ~3x throughput improvement but is irrelevant at target scale.** The 8–12 week rewrite effort, Razorpay SDK gap, and learning curve penalty provide no measurable benefit when the current stack already exceeds requirements by 20x. The opportunity cost is 2–3 months not building revenue features.

4. **Node.js provides no performance advantage over FastAPI.** TechEmpower benchmarks show Fastify and FastAPI within ~10% of each other for PostgreSQL-backed workloads. A Node.js rewrite (5–8 weeks) would provide TypeScript unification with the React frontend but no performance benefit.

5. **PostgreSQL is the correct database.** The 574K-row dataset with appropriate indexes and Redis caching performs well within requirements. No alternative database technology (SQLite, Turso, MongoDB) would provide meaningful improvement at this scale, and each introduces migration risk and feature gaps.

6. **The highest-impact optimizations are all within the current stack:** migrating national route caches to Redis (1–2 hours), adding orjson (15 minutes), slimming response models (2–4 hours), and creating materialized views for national aggregations (3–5 hours). Total effort: ~1–2 days.

7. **Cost is dominated by hosting choice, not technology choice.** The same Python/FastAPI application costs ~$5/month on Hetzner, ~$12/month on DigitalOcean, or ~$42/month on Render. Hosting selection has 4–8x more impact on cost than language selection.

---

*Report saved to: `_architect/research/2026-04-28-tech-stack-evaluation-research.md`*
