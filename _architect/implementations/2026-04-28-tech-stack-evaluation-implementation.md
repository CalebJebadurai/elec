# Implementation Report: Tech Stack Optimization for Election Analytics Platform

**Date:** 2026-04-28
**Source Plan:** `_architect/analysis/2026-04-28-tech-stack-evaluation.md`
**Status:** Ready for Implementation
**Total Estimated Effort:** 11 development days across 3 phases

---

## 1. Implementation Overview

This implementation report translates the finalized tech stack evaluation into granular, actionable steps for optimizing the Indian election analytics platform without changing its core technology stack. The strategic plan concluded that the current Python FastAPI, React 19, and PostgreSQL 16 stack should be retained and optimized rather than rewritten in Go or Node.js, because FastAPI provides approximately sixteen times the required throughput for database-bound requests and the actual performance bottlenecks are implementation-specific anti-patterns — not the language runtime.

The work is organized into three sequential phases. Phase 1 (Days 1–2) delivers quick-win performance optimizations across eight steps targeting the API layer: switching to orjson serialization, increasing cache TTLs, consolidating the national route cache into the Redis-backed system, creating slim Pydantic response models, adding missing composite database indexes, increasing the uvicorn worker count, fixing a mathematically incorrect electorate aggregation query, and adding cache stampede protection. Phase 2 (Days 3–7) migrates hosting from free-tier Railway (US servers, 150–300ms latency to India) to GCP Cloud Run in Mumbai (5ms latency) using the existing Terraform configuration in `infra/terraform/`. Phase 3 (Days 8–11) rewrites the most expensive national aggregation queries and introduces materialized views to reduce response times from 500ms–2s to under 50ms.

The affected areas of the codebase are concentrated in the `api/` directory: `main.py` (FastAPI application constructor, lifespan, middleware), `national_routes.py` (per-process cache and national aggregation queries), `routes.py` (state-level endpoints and their cache TTLs), `models.py` (Pydantic response models), `cache.py` (Redis-backed cache module), `database.py` (asyncpg connection pool), `requirements.txt` (Python dependencies), and `Dockerfile` (uvicorn worker configuration). The infrastructure files in `infra/terraform/` (main.tf, variables.tf) are modified during Phase 2. No frontend code changes are required in any phase. The database schema is extended with new indexes and materialized views via Alembic migrations in `api/alembic/versions/`.

---

## 2. Technology Stack Summary

The platform's backend is built on Python 3.12 with FastAPI 0.115.12, served by uvicorn 0.34.2 with two workers (configurable via the `WEB_CONCURRENCY` environment variable in the Dockerfile). The database driver is asyncpg 0.30.0 with a configurable connection pool (min 2, max 10 connections, set via `DB_POOL_MIN_SIZE` and `DB_POOL_MAX_SIZE` environment variables in `api/database.py`). The application uses raw SQL queries throughout — there is no ORM. All database access follows the pattern of acquiring the pool via `await get_pool()` and calling `pool.fetch()`, `pool.fetchrow()`, or `pool.fetchval()` with parameterized queries using asyncpg's `$1`, `$2` positional parameter syntax.

The caching layer is implemented in `api/cache.py` with a Redis-backed primary cache (using `redis[hiredis]>=5.0.0`) and an in-memory dictionary fallback that activates when Redis is unavailable. The cache module exposes three async functions: `get_cached(key)`, `set_cached(key, data, ttl)`, and `invalidate(key)`. Cache values are serialized to JSON via `json.dumps(data, default=str)` and deserialized via `json.loads()`. The national routes in `api/national_routes.py` maintain a separate per-process in-memory cache dictionary (`_NATIONAL_CACHE`) with its own TTL of 3600 seconds, independent of the Redis-backed system — this is one of the anti-patterns being fixed.

The Pydantic models are defined in `api/models.py`. The primary `Election` model has 48 optional fields (all nullable except `id`), and every endpoint that returns election data currently serializes all 48 fields regardless of whether the consumer needs them. Response model declarations use FastAPI's `response_model` parameter on route decorators.

Authentication uses JWT tokens (PyJWT) with httpOnly cookie transport plus CSRF double-submit cookie protection, implemented in `api/auth.py`. The `get_current_user` dependency is optional (returns None for unauthenticated users), while `require_user` raises 401. Admin endpoints use `_require_admin` in `api/admin_routes.py` which checks `user.get("role") != "admin"`. Payment processing uses the official Razorpay Python SDK (`razorpay>=1.4.0`) in `api/payment_routes.py`.

The database is PostgreSQL 16, containerized via `postgres:16-alpine` in `docker-compose.yml`. The schema is defined in `init.sql` at the project root, with the primary table `tcpd_ae` containing all election data (approximately 574,000 rows across all Indian states for both Assembly and Lok Sabha elections). Existing indexes cover single-column and some two-column composite patterns but are missing the three-column composites identified in the strategic plan. Database migrations are managed by Alembic (configured in `api/alembic.ini`, migrations in `api/alembic/versions/`), with three existing migrations: `0001_initial.py`, `0002_subscriptions.py`, and `0003_prediction_scores.py`.

The frontend is React 19.2.4 with Vite 8.0.4, using react-router-dom 7.14.1 for routing, recharts 2.15.3 for charts, react-simple-maps 3.0.0 for the India map, and Firebase 11.0.0 for client-side authentication. Testing uses vitest 3.0.0 with @testing-library/react 16.0.0. The frontend communicates with the backend via REST API calls through `src/api.js`. The Vite dev server proxies `/api` requests to the backend container.

Infrastructure is defined in `infra/terraform/` with three files: `main.tf` (Cloud Run, Cloud SQL, Cloud Storage, Global Load Balancer with CDN and SSL), `variables.tf` (region defaults to `asia-south1` Mumbai), and `terraform.tfvars.example`. The Terraform configuration provisions Cloud Run with configurable min/max instances, Cloud SQL PostgreSQL 16 with private networking, Cloud Storage for the frontend with CDN, and a Global HTTPS Load Balancer with URL map routing `/api/*` to Cloud Run and everything else to the frontend bucket. The Docker Compose file in the project root runs PostgreSQL 16, Redis 7, the FastAPI API, and optionally a Jupyter notebook service for data science.

---

## 3. Phase-by-Phase Implementation

### Phase 1: Quick-Win Performance Optimizations (Days 1–2)

#### Phase Header

Phase 1 addresses the application-level performance anti-patterns that dominate response latency. These are code-level changes that require no infrastructure modification and can be tested entirely within the local Docker Compose environment. The phase delivers an estimated 50–80% reduction in average response latency for the most-used endpoints. It has no dependencies on Phases 2 or 3 and should be implemented first regardless of whether the hosting migration proceeds.

#### Prerequisites

The local development environment must be running via `docker-compose up` with PostgreSQL, Redis, and the API containers healthy. The `tcpd_ae` table must be seeded with election data (at minimum the Tamil Nadu dataset via the CSV mount in `docker-compose.yml`, ideally the full all-states dataset). Redis must be accessible at `redis://redis:6379/0` as configured in the Docker Compose environment variable. The Alembic migration system must be functional (the `api/alembic/` directory already exists with `env.py`, `script.py.mako`, and three existing migrations in `versions/`).

#### Step 1.1: Switch to orjson for JSON Serialization

**What to do:** Add `orjson` as a dependency and configure FastAPI to use `ORJSONResponse` as its default response class. This replaces Python's standard `json` module with a Rust-based JSON serializer that is 3–10x faster for large dictionaries and lists. The impact is most significant for endpoints returning large result sets: the prediction data endpoint (14,000+ rows with the `ConstituencyPredictionData` model), the national aggregation endpoints (hundreds of rows), and the elections list endpoint. Small-payload endpoints like `/states` and `/years` will see negligible improvement.

**Where to do it:** Two files are modified. First, `api/requirements.txt` — add `orjson>=3.10.0` as a new line. Second, `api/main.py` — in the `FastAPI()` constructor call (currently around line 510, the block beginning with `app = FastAPI(`), add the `default_response_class` parameter. The import for `ORJSONResponse` comes from `fastapi.responses`.

**How it connects:** The `ORJSONResponse` class is a drop-in replacement for FastAPI's default `JSONResponse`. It serializes response data using orjson instead of the standard library's `json.dumps`. All existing endpoints automatically use it without any per-route changes. The `cache.py` module's `set_cached` function still uses `json.dumps` for Redis serialization — this is intentional and should not be changed to orjson, because the cache stores data that is later deserialized by `json.loads`, and mixing serializers could cause compatibility issues with cached entries written before the change.

**Technology-specific guidance:** Import `ORJSONResponse` from `fastapi.responses` at the top of `main.py`, alongside the existing `JSONResponse` import. The FastAPI constructor parameter is `default_response_class=ORJSONResponse`. orjson automatically handles Python `datetime`, `date`, `Decimal`, and `UUID` types, and it supports the same data structures as the standard json module. The existing `default=str` fallback used in `cache.py`'s `json.dumps` call is not needed for orjson, which handles these types natively.

**What to watch out for:** orjson serializes `float('nan')` and `float('inf')` differently from the standard json module — it raises `ValueError` instead of producing invalid JSON. The `_safe_float` function in `national_routes.py` already guards against NaN and Inf values, so this should not be an issue for national endpoints. However, verify that no other endpoint returns raw NaN or Inf values from PostgreSQL `NUMERIC` columns. The `turnout_percentage`, `vote_share_percentage`, `margin_percentage`, and `enop` columns in `tcpd_ae` are all `NUMERIC` type and could theoretically contain NaN if the source CSV had invalid data.

**Verification:** After the change, start the API container and request a large-response endpoint like `/v1/elections?state=Tamil_Nadu&limit=500`. Verify the response Content-Type is `application/json` and the body is valid JSON. Check the response time compared to the pre-change baseline. The response body and structure should be byte-for-byte identical (modulo insignificant whitespace differences — orjson does not add trailing whitespace or newlines by default, while the standard json module may).

---

#### Step 1.2: Increase Cache TTLs for Static Election Data

**What to do:** Change the response cache TTL for state-level election data endpoints from 5 minutes (300 seconds) to 24 hours (86,400 seconds). Historical election data does not change between ingestion events, which occur at most a few times per year. The 5-minute TTL causes unnecessary database query volume — approximately 95% of queries hitting PostgreSQL are redundant re-fetches of data that has not changed. Additionally, create an admin-only cache-busting endpoint that invalidates all caches when new election data is ingested.

**Where to do it:** The primary change is in `api/routes.py`. The module-level variable `_CACHE_TTL = 300` (around line 30) controls the TTL for the in-memory fallback cache and is used as the implicit TTL for `_set_cached_async` calls. Every call to `_set_cached_async` in the state-level endpoints (`list_states`, `stats_summary`, `list_years`, `list_parties`, `list_constituencies`, `list_districts`, `constituency_swing`, `state_swing_summary`) should pass `ttl=86400` explicitly. The national route endpoints in `national_routes.py` use `_NATIONAL_CACHE_TTL = 3600` — this should remain at 3600 for now, as Step 1.3 will migrate these to the Redis-backed system. The cache-busting endpoint should be added to `api/admin_routes.py`.

**How it connects:** The `set_cached` function in `cache.py` accepts a `ttl` parameter (defaulting to 300). When the developer increases the TTL to 86,400, the same function is called with a larger TTL value — no changes to `cache.py` are needed. The cache-busting admin endpoint should call `cache.invalidate(key)` for known cache key patterns, or preferably use a Redis `SCAN` with pattern matching to find all keys matching `stats_summary:*`, `states_list`, `years:*`, `parties:*`, `constituencies:*`, etc. The endpoint must use the existing `_require_admin` dependency from `admin_routes.py` for authentication.

**Technology-specific guidance:** The cache-busting endpoint should be a `POST /v1/admin/cache/clear` route in `admin_routes.py`. It should accept an optional `prefix` query parameter to clear only specific cache groups (e.g., `prefix=stats_summary` clears only stats summary caches, while no prefix clears everything). The endpoint must be rate-limited to one invocation per minute — implement this using a simple timestamp check with a module-level variable, not the general rate limiter, to avoid affecting other admin endpoints. For staggered invalidation, after clearing one group of cache keys, insert an `await asyncio.sleep(1)` before clearing the next group. This prevents a thundering herd of database queries when all caches expire simultaneously during a traffic spike. The groups should be: (1) state lists and metadata, (2) stats summaries, (3) constituency and district data, (4) national aggregation data.

**What to watch out for:** The `_get_cached` and `_set_cached` sync functions in `routes.py` (the legacy in-memory-only cache) use the module-level `_CACHE_TTL` variable for their TTL check. These sync functions are still used by some endpoints that have not been migrated to the async versions. Changing `_CACHE_TTL` to 86400 affects these sync-cached endpoints too. This is acceptable for state-level election data endpoints, but verify that the `/elections` endpoint (which uses the full `Election` model and is user-filtered) does not use this sync cache — paginated user-filtered queries should not be cached with a 24-hour TTL because the filter parameters vary.

**Verification:** After the change, request `/v1/stats/summary?state=Tamil_Nadu` twice within 10 seconds. The second request should return in under 1ms (from Redis cache). Verify via `redis-cli GET stats_summary:Tamil_Nadu:AE` that the key exists and has a TTL of approximately 86,400 seconds (use `redis-cli TTL stats_summary:Tamil_Nadu:AE`). Test the cache-busting endpoint by calling `POST /v1/admin/cache/clear` with admin authentication, then verifying that a subsequent data request hits the database (visible in PostgreSQL query logs or response timing).

---

#### Step 1.3: Consolidate National Route Caching into the Redis-Backed System

**What to do:** Replace the per-process in-memory cache in `national_routes.py` with the Redis-backed cache system from `cache.py`. The national routes currently maintain a separate `_NATIONAL_CACHE` dictionary (defined around line 23 of `national_routes.py`) with helper functions `_get_cached` and `_set_cached` that are local to that module. These shadow the names of the Redis-backed functions in `cache.py` but operate entirely in-process memory, meaning cached national data is lost on server restart and is not shared across workers when multiple uvicorn workers are running.

**Where to do it:** The changes are entirely within `api/national_routes.py`. Remove the `_NATIONAL_CACHE` dictionary, the `_NATIONAL_CACHE_TTL` constant, and the local `_get_cached` and `_set_cached` functions (lines 22–35 approximately). Import `get_cached` and `set_cached` from `cache.py` instead. Update every endpoint function in the module to call the imported async cache functions instead of the local sync ones.

**How it connects:** After this change, all national cache data flows through `cache.py`'s Redis-backed system with its in-memory dictionary fallback. The `warm_cache` function at the bottom of `national_routes.py` (called from `main.py`'s lifespan context during startup) will populate the Redis cache instead of the per-process dictionary, meaning the warmed cache is available to all workers immediately. The cache keys used in national routes (`national_state_summary:AE`, `national_party_strength:AE:None:None`, `national_turnout_trends:GE`, `national_upcoming`, `national_compare:...`) will now be stored in Redis alongside the state-level cache keys.

**Technology-specific guidance:** The current local `_get_cached` function is synchronous (it returns the cached value directly). The `cache.py` `get_cached` function is async (it returns a coroutine). Every call site must be changed from `cached = _get_cached(cache_key)` to `cached = await get_cached(cache_key)`. Similarly, `_set_cached(cache_key, result)` becomes `await set_cached(cache_key, result, ttl=3600)`. The TTL of 3600 seconds (1 hour) should be preserved for national endpoints, matching the current `_NATIONAL_CACHE_TTL` value.

There is a critical serialization difference to handle. The current `_NATIONAL_CACHE` stores Pydantic model instances directly (e.g., a list of `NationalStateSummary` objects). The `cache.py` `set_cached` function calls `json.dumps(data, default=str)`, which will fail on Pydantic model instances because they are not directly JSON-serializable by the standard json module. Each endpoint must convert its result to a list of dictionaries before caching. The pattern is: after constructing the result list of Pydantic models, call `[item.model_dump() for item in result]` to produce a list of plain dictionaries, cache that, and when retrieving from cache, return the cached dictionaries directly (FastAPI will serialize them to JSON in the response). Alternatively, use Pydantic's `.model_dump()` on each item and cache the resulting dicts, then reconstruct the models from the cached dicts on retrieval. The simpler approach is to cache the dict representations and return them directly — FastAPI accepts both Pydantic models and dictionaries for response serialization when `response_model` is set.

**What to watch out for:** The `cache.py` module's in-memory fallback stores data as JSON strings (it calls `json.dumps` on write and `json.loads` on read), while the current `_NATIONAL_CACHE` stores Python objects directly. After the migration, cached data goes through a JSON serialization round-trip, which means any Python-specific types (e.g., `set`, `Decimal`) that are not JSON-serializable will cause errors. The national route results use `float` for vote shares and `int` for counts, both of which serialize cleanly. The `years_active` field in `NationalPartyStrength` is a `list[int]`, which also serializes cleanly. Verify that no field contains a `set` or other non-JSON type.

The `warm_cache` function in `national_routes.py` must also be updated to use the async `set_cached` from `cache.py`. This function is called from `main.py`'s lifespan via `asyncio.create_task(_warm())`, which already runs in an async context, so calling `await set_cached(...)` within it is valid.

**Verification:** After the change, start the API container and request `/v1/national/state-summary`. Verify the response is correct. Then check Redis: `redis-cli GET national_state_summary:AE` should return a JSON string containing the state summary data. Restart the API container (simulating a worker restart) and immediately request `/v1/national/state-summary` again — it should return from the Redis cache without hitting PostgreSQL (visible in response time: sub-millisecond for cache hit versus 500ms+ for database query). Test with Redis down (stop the Redis container): the API should fall back to the in-memory dictionary cache and still serve requests, logging a warning about Redis unavailability.

---

#### Step 1.4: Create Slim Response Models for List Endpoints

**What to do:** Define new Pydantic response models with only the fields needed for list views, reducing the serialization overhead from 48 fields to 5–15 fields per record. The full `Election` model should remain available for single-record detail endpoints (e.g., `GET /v1/elections/{id}`), but list endpoints that return many records should use the slim models.

**Where to do it:** The new models are defined in `api/models.py`. The endpoint response_model declarations are updated in `api/routes.py` and `api/national_routes.py`.

Three new models are needed. First, `ElectionListItem` with fields: `id` (int), `year` (int), `constituency_name` (str, optional), `constituency_no` (int, optional), `party` (str, optional), `candidate` (str, optional), `votes` (int, optional), `vote_share_percentage` (float, optional), `position` (int, optional), `margin` (int, optional), `turnout_percentage` (float, optional), `election_type` (str, optional), `state_name` (str, optional). This model is used by the `/elections` paginated list endpoint, the `/elections/{year}/results` endpoint, and the `/candidates` search endpoint. Second, a `PaginatedElectionsList` model identical to `PaginatedElections` but with `data: list[ElectionListItem]` instead of `data: list[Election]`. Third, `CandidateSearchResult` with the same fields as `ElectionListItem` plus `sex` (str, optional), `age` (int, optional), and `district_name` (str, optional) — or simply reuse `ElectionListItem` if the additional fields are not needed by the frontend consumer.

**How it connects:** The existing `_row_to_election` function in `routes.py` constructs a full `Election` model from a database row via `Election(**dict(row))`. For the slim models, create a corresponding `_row_to_election_list_item` function that constructs an `ElectionListItem` from a row, selecting only the needed columns. Alternatively, modify the SQL queries in these endpoints to `SELECT` only the needed columns instead of `SELECT *`, which also reduces data transfer from PostgreSQL and memory allocation for row objects.

**Technology-specific guidance:** Define the new models in `models.py` after the existing `Election` model. Each model should inherit from `BaseModel` and declare only the needed fields with appropriate types and defaults (matching the field definitions in the `Election` model). For the paginated elections endpoint in `routes.py`, change the `response_model` from `PaginatedElections` to the new `PaginatedElectionsList`, and change the SQL query from `SELECT *` to `SELECT id, year, constituency_name, constituency_no, party, candidate, votes, vote_share_percentage, position, margin, turnout_percentage, election_type, state_name`. For the candidates search endpoint, similarly narrow the SELECT clause and change the response_model. For the year results endpoint (`/elections/{year}/results`), change the response_model from `list[Election]` to `list[ElectionListItem]`.

**What to watch out for:** The frontend in `src/api.js` may depend on fields that are being removed from list responses. Check the frontend components that consume these endpoints — `ConstituencyList.jsx`, `ElectionTimeline.jsx`, `PredictionConstituencyTable.jsx` — to verify they do not rely on fields absent from the slim models. The `ConstituencyDetail.jsx` component likely uses the single-record detail endpoint (`/elections/{id}`), which retains the full `Election` model and is not affected. If any frontend component relies on a field not in the slim model, either add that field to the slim model or ensure the frontend fetches the full record when needed.

The `_row_to_election` function currently passes all columns from the database row to the `Election` constructor. If the SQL query is narrowed to `SELECT` only specific columns, `_row_to_election` will fail because the row dictionary will be missing keys. This is why a separate `_row_to_election_list_item` function is needed, or the `ElectionListItem` model should be constructed from the row with only the available keys.

**Verification:** After the change, request `GET /v1/elections?state=Tamil_Nadu&limit=50`. Verify the response contains only the fields defined in `ElectionListItem`, not all 48 fields. Compare the response size in bytes against the pre-change response — it should be approximately 50–70% smaller. Measure the response time and compare against the baseline.

---

#### Step 1.5: Add Missing Composite Database Indexes

**What to do:** Create three new database indexes that correspond to frequent query patterns currently causing full-table scans: a composite index on `(state_name, position, election_type)`, a composite index on `(party, state_name, year)`, and a trigram GIN index on `candidate` (which may already exist from `init.sql` but needs to be ensured via Alembic). These indexes accelerate the national party strength queries, state-filtered party queries, and candidate search respectively.

**Where to do it:** Create a new Alembic migration file in `api/alembic/versions/`. The migration should be numbered `0004` following the existing convention (the existing migrations are `0001_initial.py`, `0002_subscriptions.py`, `0003_prediction_scores.py`). Also add the corresponding `CREATE INDEX IF NOT EXISTS` statements to the lifespan index creation block in `api/main.py` (around line 470) for consistency with the existing pattern of idempotent index creation on startup.

**How it connects:** The indexes are used automatically by PostgreSQL's query planner when it determines that an index scan is more efficient than a sequential scan. No application code changes are needed — the same SQL queries benefit from the indexes without modification. The composite index on `(state_name, position, election_type)` directly serves the national state summary endpoint's CTE queries that filter on these three columns. The composite index on `(party, state_name, year)` serves the party strength endpoint's `GROUP BY party` with `WHERE position = 1 AND state_name NOT IN (...)` filter. The trigram index on `candidate` serves the ILIKE search in the candidates endpoint.

**Technology-specific guidance:** Generate the Alembic migration by running `cd api && alembic revision -m "add composite indexes"` from a terminal. This creates a new file in `api/alembic/versions/` with empty `upgrade()` and `downgrade()` functions. In the `upgrade()` function, execute three `CREATE INDEX CONCURRENTLY` statements. Note that `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block, so the migration must set `transaction = False` at the module level (this is an Alembic-specific mechanism: add the line `transaction = False` at the top of the migration file, outside any function). In the `downgrade()` function, execute `DROP INDEX IF EXISTS` for each index to ensure reversibility.

The index names should follow the existing convention from `init.sql`: `idx_tcpd_state_pos_et` for `(state_name, position, election_type)`, `idx_tcpd_party_state_year` for `(party, state_name, year)`, and `idx_tcpd_candidate_trgm` for the trigram index (this name already exists in `init.sql`, so the migration should use `CREATE INDEX IF NOT EXISTS` to be idempotent).

For the trigram index, the migration must first ensure the `pg_trgm` extension is available: execute `CREATE EXTENSION IF NOT EXISTS pg_trgm` before creating the index. The existing `init.sql` already does this with error handling, but in an Alembic migration the extension creation should be unconditional since pg_trgm is available in PostgreSQL 16 and in the `postgres:16-alpine` Docker image.

**What to watch out for:** `CREATE INDEX CONCURRENTLY` does not lock the table for writes but takes longer than a regular `CREATE INDEX`. On the 574,000-row `tcpd_ae` table, each index creation should complete in under 10 seconds. If the migration runs against a production database while the API is serving traffic, concurrent index creation is essential to avoid downtime. However, if Alembic runs the migration outside a transaction (which is required for `CONCURRENTLY`), a failure mid-migration could leave a partially created index. Use `DROP INDEX IF EXISTS` at the beginning of the `upgrade()` function before each `CREATE INDEX CONCURRENTLY` to ensure idempotency on retry.

**Verification:** After running the migration, connect to PostgreSQL and verify the indexes exist: `\di idx_tcpd_state_pos_et`, `\di idx_tcpd_party_state_year`, `\di idx_tcpd_candidate_trgm`. Run `EXPLAIN ANALYZE` on a representative national query (e.g., the state summary CTE from `national_routes.py`) and verify that the query plan shows an Index Scan or Bitmap Index Scan using the new index, not a Sequential Scan.

---

#### Step 1.6: Increase Uvicorn Worker Count to Four

**What to do:** Change the default uvicorn worker count from 2 to 4 by modifying the `WEB_CONCURRENCY` default in the Dockerfile's `CMD` instruction. This approximately doubles throughput capacity on a 2-vCPU machine. The workload is I/O-bound (asyncpg non-blocking database calls and Redis calls), so 4 workers per 2 vCPUs is appropriate — workers spend most of their time awaiting database responses, not consuming CPU.

**Where to do it:** The change is in `api/Dockerfile`, specifically the `CMD` line (the last line of the file). Change the default value in `os.environ.get('WEB_CONCURRENCY', '2')` from `'2'` to `'4'`.

**How it connects:** Uvicorn spawns the specified number of worker processes, each running an independent copy of the FastAPI application. Each worker has its own asyncpg connection pool (min 2, max 10 connections, configured in `database.py`). With 4 workers, the total connection pool ranges from 8 to 40 connections to PostgreSQL. The PostgreSQL `max_connections` is set to 100 in the Terraform configuration (in `main.tf`'s database_flags block), so 40 maximum connections is well within limits. The local Docker Compose PostgreSQL instance uses the default `max_connections` of 100, which also accommodates 40 connections.

**Technology-specific guidance:** The Dockerfile's CMD is a single Python one-liner that calls `os.execlp` to launch uvicorn. The change is purely the default value string. The `WEB_CONCURRENCY` environment variable can still override this at deploy time (e.g., setting it to 2 on a single-vCPU machine or to 8 on a 4-vCPU machine).

**What to watch out for:** Increasing workers to 4 doubles the per-process in-memory rate-limit bypass window. When Redis is unavailable, each worker enforces rate limits independently using its own `_rate_store` dictionary in `main.py`. This means a client could make `RATE_LIMIT_REQUESTS × 4` requests per window across all workers before being limited. The strategic plan notes this is acceptable but reinforces the importance of Redis availability for rate limiting. If Redis availability cannot be guaranteed, consider reducing `RATE_LIMIT_REQUESTS` from 100 to 50 (via the `RATE_LIMIT_REQUESTS` environment variable) to compensate for the doubled worker count, maintaining an effective per-client limit of 200 requests per window.

Also, with 4 workers each maintaining their own `_usage_counters` dictionary for usage metering (in `main.py`), the `_flush_usage` function runs independently in each worker, which is correct — the usage records are written to PostgreSQL with an `ON CONFLICT DO NOTHING` clause.

**Verification:** After rebuilding the Docker image and restarting the container, verify the worker count by checking the uvicorn startup logs: the output should show `Started server process [PID]` four times (once per worker). Run a simple load test using `wrk -t2 -c10 -d10s http://localhost:8000/health` and compare throughput against the 2-worker baseline.

---

#### Step 1.7: Fix the SUM DISTINCT Electors Anti-Pattern

**What to do:** Fix the mathematically incorrect `SUM(DISTINCT electors)` pattern in the national turnout trends endpoint in `national_routes.py`. The current query (`SELECT ... SUM(DISTINCT electors) AS total_electors ... FROM tcpd_ae ...`) produces incorrect results because `DISTINCT` operates on the elector *values*, not on constituencies. If two different constituencies happen to have the same number of electors (e.g., both have 200,000), only one value is summed, undercounting the total electorate. The correct approach is to pre-group by constituency to get one elector value per constituency, then sum across constituencies.

**Where to do it:** The change is in `api/national_routes.py`, in the `national_turnout_trends` endpoint function (the SQL query around line 290). The same pattern exists in the `stats_summary` endpoint in `api/routes.py` (around line 440, the subquery for `electors`), but that endpoint already uses a pre-grouping subquery (`SELECT constituency_no, MAX(electors) AS electors FROM tcpd_ae ... GROUP BY constituency_no`) which is the correct pattern. The national state summary endpoint's electors CTE (around line 100 in `national_routes.py`) already uses the correct pre-grouping pattern — it was fixed at some point. So the change is only needed in the turnout trends query.

**How it connects:** The turnout trends endpoint returns `NationalTurnoutTrend` objects with a `total_electors` field. After the fix, this field will contain the correct sum of electors across all constituencies for each year. The change is both a data correctness fix and a minor performance optimization (eliminating the `DISTINCT` aggregation).

**Technology-specific guidance:** Replace the `SUM(DISTINCT electors) AS total_electors` expression in the turnout trends SQL query with a subquery or CTE that pre-groups by `state_name`, `constituency_name` (or `constituency_no`), and `year` to get one elector value per constituency, then sums across constituencies within each year. The pattern to follow is the electors CTE already used in the `national_state_summary` endpoint (around line 100): a subquery that selects `state_name, constituency_no, MAX(electors) AS max_e` grouped by `state_name, constituency_no`, then the outer query sums `max_e`. Adapt this pattern for the turnout trends query, which groups by `year` instead of by `state_name`.

**What to watch out for:** This is an intentional change in query semantics — the output values will differ from the current results. Before making the change, capture the current output as a golden file for reference (not for regression testing, since the current output is incorrect). After the change, manually verify the total electors for a known year (e.g., the 2024 Lok Sabha election) against published Election Commission of India figures to confirm the fix is correct.

**Verification:** Request `GET /v1/national/turnout-trends?election_type=GE` and examine the `total_electors` values for recent years. Compare against known Election Commission of India figures for the corresponding Lok Sabha elections. The values should now be plausible (e.g., approximately 900–970 million total electors for recent GE years). The old `SUM(DISTINCT ...)` values likely undercounted by an unpredictable amount.

---

#### Step 1.8: Add Cache Stampede Protection

**What to do:** Implement a distributed lock mechanism in `cache.py` to prevent cache stampede (also known as "thundering herd"). When a cache entry expires during a traffic spike, multiple concurrent requests may simultaneously attempt to execute the same expensive database query. Only one request should execute the query and repopulate the cache; the others should either wait briefly for the cache to be repopulated or receive a stale cached value.

**Where to do it:** The implementation goes in `api/cache.py` as a new async function, and the national route endpoints in `api/national_routes.py` are the primary consumers. The function should be called `get_cached_with_lock` or similar, providing a higher-level abstraction that wraps the existing `get_cached` and `set_cached` functions with lock acquisition logic.

**How it connects:** The new function is used by the national route endpoints instead of calling `get_cached` and `set_cached` separately. It accepts a cache key, a TTL, and an async callable that produces the data on cache miss. The function checks the cache, and on a miss, attempts to acquire a Redis lock (using `SETNX`). If the lock is acquired, it calls the data-producing callable, caches the result, and releases the lock. If the lock is not acquired (another request is already regenerating the cache), it polls the cache with a short sleep interval (50ms) for up to a configurable timeout (e.g., 5 seconds), returning the result once it appears. If the timeout expires and no cached data is available, the waiting request falls through to execute the query itself (to prevent deadlocks if the lock-holding request fails).

**Technology-specific guidance:** The Redis `SETNX` command (set if not exists) is used for lock acquisition. The lock key should be derived from the cache key with a `lock:` prefix (e.g., `lock:national_state_summary:AE`). The lock TTL should be short — 10 to 30 seconds — to prevent indefinite locks if the lock-holding request crashes. Use Redis `SET key value NX EX ttl` (the modern atomic equivalent of SETNX with expiry) via `await redis.set(lock_key, "1", nx=True, ex=30)`. The return value indicates whether the lock was acquired (True) or not (None/False). After populating the cache, release the lock by deleting the lock key: `await redis.delete(lock_key)`.

In the in-memory fallback case (when Redis is unavailable), the lock mechanism is not needed because the in-memory cache is per-process — each process independently handles its own cache. The lock function should degrade gracefully: if Redis is unavailable, skip the lock and just call the data-producing callable directly.

**What to watch out for:** The lock release must happen in a `try/finally` block to ensure the lock is released even if the data-producing callable raises an exception. If the lock-holding request fails without releasing the lock, the 30-second TTL on the lock key will auto-release it — subsequent requests will be able to acquire the lock after the TTL expires. This is the correct behavior and prevents permanent lock-out.

The polling loop (for requests waiting for the lock to be released) must have a maximum iteration count or timeout to prevent infinite loops. Ten iterations with 50ms sleeps gives a 500ms maximum wait, which is appropriate for national endpoints that take 500ms–2s to execute. If the wait exceeds the timeout, the waiting request should fall through and execute the query itself — this adds one extra query but prevents request timeouts.

**Verification:** This step is best verified with a concurrency test. Use a tool like `wrk` or write a small async script that sends 50 concurrent requests to `/v1/national/state-summary` immediately after clearing the national cache (via the admin cache-busting endpoint from Step 1.2). With stampede protection, only one request should hit PostgreSQL (visible in the database query logs), while the other 49 requests should receive the cached result after a brief wait. Without stampede protection, all 50 requests would hit PostgreSQL simultaneously.

---

#### Phase 1 Deliverables

At the end of Phase 1, the following are true: the API uses orjson for JSON serialization (visible in the startup log and response timing), cache TTLs for state-level data are 24 hours, national route caching is unified with the Redis-backed system, list endpoints return slim response models with 5–15 fields instead of 48, three new composite indexes exist on the `tcpd_ae` table, uvicorn runs 4 workers, the national turnout trends electorate calculation is mathematically correct, and cache stampede protection prevents thundering herd on cache expiry. The API responds correctly to all existing endpoints with improved response times.

#### Phase 1 Risks and Mitigations

The primary risk is that the slim response models in Step 1.4 may omit a field that the frontend depends on. Mitigation: before implementing the slim models, audit the frontend components that consume list endpoints to identify all used fields. The risk is low because the frontend primarily uses the full Election model for detail views (single-record endpoints) and only needs key fields for list rendering.

The cache consolidation in Step 1.3 carries a risk of serialization incompatibility between the current in-memory Python object storage and the JSON serialization required by Redis. Mitigation: the national route results use only JSON-compatible types (str, int, float, list, None), so this risk is low. Test by requesting each national endpoint and verifying the response matches the pre-change output.

---

### Phase 2: Hosting Migration to GCP Cloud Run Mumbai (Days 3–7)

#### Phase Header

Phase 2 migrates the platform from free-tier Railway (US-based servers) to GCP Cloud Run in the asia-south1 (Mumbai) region, reducing network latency to Indian users from 150–300ms to approximately 5ms. This phase uses the existing Terraform configuration in `infra/terraform/` with targeted modifications for cost optimization. Phase 2 depends on Phase 1 being complete (the optimized code should be deployed to GCP, not the unoptimized version).

#### Prerequisites

A GCP project with billing enabled must exist. The `gcloud` CLI must be installed and authenticated. The following one-time setup tasks must be completed before Terraform can run: create the GCS bucket for Terraform state (`elec-terraform-state` — referenced in `infra/terraform/main.tf`'s backend configuration), enable the required GCP APIs (run `gcloud services enable run.googleapis.com sqladmin.googleapis.com compute.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com servicenetworking.googleapis.com artifactregistry.googleapis.com`), and configure IAM roles for the authenticated user (Project Owner or equivalent). An Upstash Redis account (free tier) should be created at upstash.com for the Redis cache.

#### Step 2.0: Complete GCP Prerequisites

**What to do:** Set up all GCP infrastructure prerequisites that must exist before Terraform can provision resources. This includes creating the GCP project, enabling billing, installing the `gcloud` CLI, authenticating, creating the Terraform state bucket, enabling required APIs, and configuring IAM.

**Where to do it:** These are entirely CLI and console operations — no code changes.

**How it connects:** The Terraform backend configuration in `infra/terraform/main.tf` (line 11) specifies `bucket = "elec-terraform-state"` for state storage. This bucket must exist before `terraform init` will succeed. The required GCP APIs are listed in the `google_project_service.apis` resource (line 30 of `main.tf`), but Terraform cannot enable them if the user does not have sufficient IAM permissions.

**Technology-specific guidance:** Create the state bucket using `gsutil mb -p PROJECT_ID -l asia-south1 gs://elec-terraform-state`. Use `gcloud auth application-default login` for Terraform authentication. Enable APIs using the `gcloud services enable` command listed in prerequisites. Create a `terraform.tfvars` file in `infra/terraform/` based on `terraform.tfvars.example`, filling in `project_id`, `domain`, `db_password` (generate a strong random password), and `jwt_secret` (must match the existing `JWT_SECRET` value from Railway, or all existing JWT tokens will be invalidated on migration).

**What to watch out for:** The JWT secret must be the same between Railway and GCP deployments during the parallel-running period, otherwise users authenticated against Railway will not be able to use the GCP deployment and vice versa. Extract the current `JWT_SECRET` from Railway's environment configuration and use it in the `terraform.tfvars` file.

**Verification:** Run `terraform init` in the `infra/terraform/` directory. It should successfully initialize the backend and download the Google provider. If it fails with a bucket access error, the state bucket was not created or the IAM permissions are insufficient.

---

#### Step 2.1: Review and Update Terraform Configuration

**What to do:** Update the Terraform configuration to reflect the current codebase requirements and optimize for cost. The key changes are: override `db_tier` to `db-f1-micro` (shared core, 614MB RAM, approximately $8.50/month instead of the default `db-custom-1-3840` at $50–80/month), add environment variables for Redis (Upstash URL), Razorpay credentials, Sentry DSN, and Firebase configuration, and verify the min/max instances settings.

**Where to do it:** The changes are in `infra/terraform/main.tf` and `infra/terraform/variables.tf`. Optionally create a new `infra/terraform/terraform.tfvars` file (which should be `.gitignore`'d as it contains secrets).

**How it connects:** The Terraform configuration provisions Cloud SQL, Cloud Run, Cloud Storage, and the Global Load Balancer. The Cloud Run service's environment variables (starting around line 230 of `main.tf`) must match the environment variables expected by the FastAPI application (visible in `docker-compose.yml` and throughout the Python code). Currently, the Terraform configuration only sets `DATABASE_URL`, `JWT_SECRET`, `ALLOWED_ORIGINS`, and `GOOGLE_CLIENT_ID`. Missing environment variables that the application expects include: `REDIS_URL`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_PLAN_ID_PRO`, `SENTRY_DSN`, `FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY`, `COOKIE_SECURE` (should be `true` for production), `WEB_CONCURRENCY` (should be `4` per Step 1.6), and `SEED_SECRET` (for the admin seed endpoint).

**Technology-specific guidance:** For each missing environment variable, add either a direct `env` block in the Cloud Run container definition (for non-sensitive values like `WEB_CONCURRENCY`, `COOKIE_SECURE`) or a Secret Manager secret with `value_source.secret_key_ref` (for sensitive values like `RAZORPAY_KEY_SECRET`, `SENTRY_DSN`). Follow the existing pattern established for `DATABASE_URL` and `JWT_SECRET` in `main.tf`. Add corresponding Terraform variables to `variables.tf` for any new secret values.

For the `db_tier` override: in `terraform.tfvars`, set `db_tier = "db-f1-micro"`. Do not change the default in `variables.tf` — keep the default as documentation of the recommended production tier, and override it in the tfvars file for cost optimization during the initial low-traffic phase. Set `db_ha_enabled = false` in `terraform.tfvars` to use a single-zone instance (saves approximately 50% on Cloud SQL cost — regional HA is not needed at this scale and can be enabled later).

For Redis, use the Upstash Redis connection URL as an environment variable: add an `env` block with `name = "REDIS_URL"` and the Upstash URL as the value (or store it in Secret Manager if preferred). Upstash Redis URLs follow the format `rediss://default:PASSWORD@ENDPOINT:PORT` (note `rediss://` with double-s for TLS).

**What to watch out for:** The Cloud Run service's `ingress` setting is currently `INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER`, which means the Cloud Run service only accepts traffic from the Global Load Balancer, not direct internet access. This is correct for production but makes testing difficult — during Step 2.3, temporarily set it to `INGRESS_TRAFFIC_ALL` for direct testing, then revert to `INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER` before going live.

The `startup_cpu_boost = true` setting (line 247 of `main.tf`) gives the container full CPU during startup, which mitigates Python's cold-start time. Keep this enabled.

**Verification:** Run `terraform plan` and review the planned changes. Verify that the plan creates the expected resources (Cloud SQL instance with `db-f1-micro` tier, Cloud Run service with the correct environment variables, Cloud Storage bucket, Global Load Balancer). The plan should not destroy or modify any existing resources (since this is a fresh deployment).

---

#### Step 2.2: Set Up Cloud SQL and Migrate Data

**What to do:** Provision the Cloud SQL PostgreSQL instance via Terraform and load both election data and user-generated data. Election data is loaded from CSV files using the seed scripts. User-generated data (users, bookmarks, votes, subscriptions, API keys, usage summaries) must be exported from the Railway PostgreSQL database and imported into Cloud SQL.

**Where to do it:** This step involves running Terraform commands, psql/pg_dump/pg_restore CLI commands, and the seed scripts from `infra/`.

**How it connects:** After this step, the Cloud SQL instance contains all data from the Railway database. The Cloud Run service (deployed in Step 2.3) will connect to Cloud SQL via a Unix socket (private networking, configured in the Cloud Run `volumes` block in `main.tf` line 288). The connection string uses the format `postgresql://elec:PASSWORD@/elec?host=/cloudsql/PROJECT:asia-south1:elec-postgres`, which is stored in Secret Manager by Terraform.

**Technology-specific guidance:** Run `terraform apply` to provision the Cloud SQL instance (this can take 10–15 minutes for a new instance). After provisioning, connect to the Cloud SQL instance using the Cloud SQL Auth Proxy (`cloud_sql_proxy`) or via a temporary authorized network (add the developer's IP to the instance's authorized networks in the GCP console — remember to remove it after data loading). Load the election data using the admin seed endpoint or by running the SQL commands from `init.sql` against the Cloud SQL instance. For user data migration, run `pg_dump -h RAILWAY_HOST -p RAILWAY_PORT -U RAILWAY_USER -d RAILWAY_DB --data-only -t users -t bookmarks -t votes -t subscriptions -t api_keys -t usage_summary > user_data.sql` against the Railway database, then `psql -h CLOUD_SQL_IP -U elec -d elec < user_data.sql` against Cloud SQL. Verify data integrity by comparing row counts: `SELECT COUNT(*) FROM tcpd_ae`, `SELECT COUNT(*) FROM users`, `SELECT COUNT(*) FROM bookmarks`, `SELECT COUNT(*) FROM subscriptions` on both databases.

**What to watch out for:** The Railway database connection details must be obtained from the Railway dashboard. Railway PostgreSQL URLs typically follow the format `postgresql://USER:PASS@HOST.railway.app:PORT/railway`. The `pg_dump` command must use the `--data-only` flag because the table schemas should be created by the FastAPI application's lifespan function (which runs CREATE TABLE IF NOT EXISTS on startup). If user data includes serial ID sequences, ensure the sequences are updated after import: `SELECT setval('users_id_seq', (SELECT MAX(id) FROM users))` for each table with a serial primary key.

**Verification:** Connect to the Cloud SQL instance and run `SELECT COUNT(*) FROM tcpd_ae` — it should return approximately 574,000 rows. Run `SELECT COUNT(*) FROM users` and compare against the Railway database count. Run a representative query (e.g., `SELECT * FROM tcpd_ae WHERE state_name = 'Tamil_Nadu' AND year = 2021 AND position = 1 LIMIT 5`) and verify the results match the Railway database.

---

#### Step 2.3: Deploy the API to Cloud Run

**What to do:** Build the Docker image with the Phase 1 optimizations, push it to Google Artifact Registry, and deploy the Cloud Run service via Terraform.

**Where to do it:** The Docker image is built from `api/Dockerfile`. The Artifact Registry repository is created by Terraform (the `google_artifact_registry_repository.elec` resource in `main.tf`). The Cloud Run service configuration is in `main.tf`.

**How it connects:** The Cloud Run service is the backend for the Global Load Balancer, which routes `/api/*` requests to Cloud Run and everything else to the Cloud Storage frontend bucket. The Cloud Run service connects to Cloud SQL via the Cloud SQL Auth Proxy sidecar (configured in the `volumes` block) and to Upstash Redis via the `REDIS_URL` environment variable.

**Technology-specific guidance:** Build and push the Docker image using: `gcloud builds submit --tag REGION-docker.pkg.dev/PROJECT_ID/elec/api:latest ./api` (this builds in the cloud using Cloud Build). Alternatively, build locally and push: `docker build -t REGION-docker.pkg.dev/PROJECT_ID/elec/api:latest ./api && docker push REGION-docker.pkg.dev/PROJECT_ID/elec/api:latest`. After pushing the image, run `terraform apply` to update the Cloud Run service. If the Cloud Run service was already created in Step 2.2's `terraform apply`, this step updates it to use the new image.

For testing, temporarily set the Cloud Run ingress to `INGRESS_TRAFFIC_ALL` and access the service URL directly (shown in the Terraform output or `gcloud run services describe elec-api --region asia-south1`). Test the health endpoint: `curl https://CLOUD_RUN_URL/health`. Test a data endpoint: `curl https://CLOUD_RUN_URL/v1/states`. Verify authentication works by testing the OTP flow and Google sign-in flow against the Cloud Run URL.

**What to watch out for:** The `DATABASE_URL` format for Cloud SQL with Unix socket differs from the TCP format used by Railway. The Terraform configuration already handles this (the Secret Manager secret stores the Unix socket format). Verify that asyncpg connects successfully — asyncpg supports Unix sockets via the `?host=/cloudsql/...` query parameter. The SSL configuration in `database.py` should return `None` for Unix socket connections — verify that `_get_ssl_context()` correctly detects the Cloud SQL connection string (it checks for `localhost`, `127.0.0.1`, `host.docker`, and `@db:` — none of which match the Cloud SQL format, so it will create an SSL context). Add `@/cloudsql/` to the localhost check in `_get_ssl_context()` or set `DB_SSL_VERIFY=false` for Cloud SQL Unix socket connections (which do not use SSL — they use the Cloud SQL Auth Proxy for secure transport).

**Verification:** `curl https://CLOUD_RUN_URL/health` returns `{"status":"ok"}`. `curl https://CLOUD_RUN_URL/v1/states` returns the list of states with correct data. `curl https://CLOUD_RUN_URL/v1/national/state-summary` returns state summaries. Test the authenticated endpoints by obtaining a JWT token and passing it in the Authorization header or auth cookie.

---

#### Step 2.4: Migrate the Frontend to Cloud Storage with CDN

**What to do:** Build the frontend production bundle and upload it to the GCS bucket created by Terraform. Enable Cloud CDN caching. Verify the frontend loads correctly and communicates with the API via the load balancer.

**Where to do it:** Build the frontend from the `frontend/` directory. Upload to the GCS bucket (named `PROJECT_ID-frontend` as configured in `main.tf`).

**How it connects:** The Global Load Balancer routes all non-`/api/*` requests to the Cloud Storage backend bucket, which serves the frontend static files with CDN caching. The frontend's `VITE_API_URL` environment variable must be set to `/api` (the default) so that API requests from the browser go to the same domain and are routed by the load balancer to Cloud Run. The Vite proxy configuration in `vite.config.js` is only used during local development and does not affect the production build.

**Technology-specific guidance:** Build the frontend: `cd frontend && npm run build`. This produces the production bundle in `frontend/dist/`. Upload to GCS: `gsutil -m rsync -r -d frontend/dist/ gs://PROJECT_ID-frontend/`. The `-m` flag enables parallel upload, `-r` is recursive, and `-d` deletes files in the bucket that are not in the local directory (ensuring old assets are cleaned up). Set proper cache headers for hashed assets: `gsutil -m setmeta -h "Cache-Control:public, max-age=31536000" gs://PROJECT_ID-frontend/assets/**`. Set a short cache for index.html: `gsutil setmeta -h "Cache-Control:public, max-age=300" gs://PROJECT_ID-frontend/index.html`.

The frontend build requires Firebase environment variables to be set during build time (they are embedded in the bundle). Set these as environment variables before building, or create a `.env.production` file in `frontend/` with `VITE_API_URL=/api`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, etc. These values should match the production Firebase project configuration.

**What to watch out for:** The Cloud Storage bucket's website configuration (`main_page_suffix = "index.html"`, `not_found_page = "index.html"`) enables SPA routing — all paths serve `index.html`, and React Router handles client-side routing. Verify this works by accessing a deep link (e.g., `https://DOMAIN/state/Tamil_Nadu/overview`) and confirming the page loads correctly.

**Verification:** Access `https://DOMAIN/` in a browser. The React application should load, display the India map or state selector, and successfully fetch data from the API (visible in the browser's Network tab — requests to `/api/v1/states` should succeed).

---

#### Step 2.5: Validate Performance and Cut Over DNS

**What to do:** Run performance benchmarks against the GCP deployment from an Indian-region client, compare results against the Railway deployment, and if performance meets targets, update DNS to point to the GCP Global Load Balancer. Keep the Railway deployment running for one week as a fallback.

**Where to do it:** Performance benchmarks are run from a cloud instance in Mumbai (e.g., a GCP Compute Engine VM in asia-south1) or using a load testing service that supports Indian endpoints. DNS changes are made at the domain registrar or DNS provider.

**How it connects:** The GCP Global Load Balancer has a static IP (created by the `google_compute_global_address.lb` resource in `main.tf`). DNS should be updated to point the domain's A record to this IP. After DNS propagation (typically 1–24 hours), all traffic flows to the GCP deployment.

**Technology-specific guidance:** Run baseline benchmarks from the Mumbai VM using `wrk -t2 -c10 -d30s https://CLOUD_RUN_URL/v1/stats/summary?state=Tamil_Nadu&election_type=AE` for the API (bypassing the load balancer), and `wrk -t2 -c10 -d30s https://DOMAIN/v1/stats/summary?state=Tamil_Nadu&election_type=AE` through the load balancer. Record p50, p95, p99 latency and throughput. Compare against the same endpoints on Railway.

The performance targets from the strategic plan are: stats summary under 50ms p50, constituencies list under 100ms p50, national state summary under 50ms p50 (from cache hit), all endpoints under 500ms p95, throughput above 200 requests per second sustained.

For DNS cutover, update the A record for the domain to the GCP load balancer IP (visible via `terraform output` or `gcloud compute addresses describe elec-lb-ip --global`). Set TTL to 300 seconds during the transition period to enable quick rollback.

**What to watch out for:** DNS cutover should happen only after all three phases are complete and validated. The strategic plan explicitly recommends completing Phase 3 before cutting over DNS, to avoid maintaining two parallel deployments during active query development. During the parallel period, the Railway deployment continues serving traffic via the old DNS records, and the GCP deployment is accessible via the Cloud Run URL or a test domain.

The SSL/TLS certificate for the domain must be provisioned before DNS cutover. The Terraform configuration provisions a Google-managed SSL certificate (the `google_compute_managed_ssl_certificate` resource should be present in `main.tf` — verify it exists, and if not, add it). Google-managed certificates require DNS validation, which means the domain must point to the load balancer IP before the certificate is issued. This creates a brief window where HTTPS is unavailable — plan for off-peak cutover.

**Verification:** From a Mumbai-region client, `curl -w "%{time_total}\n" -o /dev/null -s https://DOMAIN/v1/stats/summary?state=Tamil_Nadu` should return a time under 0.1 seconds (50ms server processing + network). From the user's browser in India, the page should load in under 2 seconds. Check the GCP Cloud Run console for request logs, error rates, and latency metrics.

---

#### Phase 2 Deliverables

At the end of Phase 2, the platform is deployed on GCP Cloud Run in Mumbai with Cloud SQL PostgreSQL, Upstash Redis, and Cloud Storage with CDN for the frontend. Network latency to Indian users is 5–30ms instead of 150–300ms. Auto-scaling is configured with min 1 instance (avoiding cold starts) and max 10 instances (handling election-season spikes). The Railway deployment remains running as a fallback but is not serving production traffic (DNS points to GCP).

#### Phase 2 Risks and Mitigations

The primary risk is first-time GCP setup complexity for a developer whose deployment experience is Railway (git push). Mitigation: the prerequisites (Step 2.0) are listed explicitly, the Terraform configuration is already written and reviewed, and DigitalOcean Bangalore is available as a simpler alternative (six to twelve dollars per month with Docker Compose deployment).

The Cloud SQL Unix socket connection may fail if the `database.py` SSL context logic does not handle the Cloud SQL connection string format. Mitigation: add the Cloud SQL path pattern to the `_get_ssl_context()` function's localhost check, or set the `DB_SSL_VERIFY` environment variable to `false` in the Cloud Run configuration.

User data migration from Railway could lose data if the `pg_dump` is taken while users are actively creating bookmarks or updating profiles. Mitigation: take the pg_dump during low-traffic hours and compare row counts between source and destination.

---

### Phase 3: Database Query Optimization (Days 8–11)

#### Phase Header

Phase 3 rewrites the most expensive database queries — the national aggregation endpoints that currently take 500ms–2s — and introduces materialized views to serve pre-computed results in under 5ms. This phase delivers the largest single improvement in worst-case response latency. It depends on Phase 1's cache consolidation (Step 1.3) and index additions (Step 1.5) being in place, and ideally on Phase 2's deployment so that query performance is measured on the production database rather than a local Docker instance.

#### Prerequisites

Phase 1 must be complete (indexes, cache consolidation). The Alembic migration system must be functional. The developer should have baseline performance measurements for the three national endpoints: state summary, party strength, and turnout trends. Golden files capturing the current output for representative parameters (election_type=AE, election_type=GE) should be created before modifying any query, stored in `api/tests/fixtures/`.

#### Step 3.1: Rewrite the National State Summary Query

**What to do:** Optimize the five-CTE chain in the `national_state_summary` endpoint to reduce redundant full-table scans. The current query (in `national_routes.py` starting around line 65) computes the latest election year per state in the `latest` CTE, then joins against the base `tcpd_ae` table four more times (for winners, ranked, turnout, and electors). Each join filters by `state_name = l.state_name AND year = l.latest_year` plus the election type filter, causing PostgreSQL to scan the table repeatedly. The optimization is to compute the latest year once, then use a single subquery that filters the base table to only rows matching the latest year per state, and compute all aggregations (winners, turnout, electors) from that pre-filtered set.

**Where to do it:** The change is in `api/national_routes.py`, in the `national_state_summary` endpoint function. The entire SQL string (the `pool.fetch(f"""...""")` call) is replaced with the optimized version.

**How it connects:** The endpoint returns the same `list[NationalStateSummary]` response with the same fields — only the query efficiency changes. The Python code that processes the rows (the for-loop constructing `NationalStateSummary` objects) should not need modification if the column names in the query result remain the same.

**Technology-specific guidance:** The optimized query structure computes `latest_year_per_state` as a single CTE, then creates a `filtered` CTE that is a simple `JOIN` between `tcpd_ae` and `latest_year_per_state` (filtering the base table to only latest-year rows once). All subsequent aggregations (ruling party, runner-up, turnout average, elector sum) are computed from the `filtered` CTE rather than re-joining against the full `tcpd_ae` table. This changes the query plan from multiple full-table scans to one filtered scan (using the `idx_tcpd_state_year_pos` index) followed by in-memory aggregation of the filtered set.

The existing electors CTE pattern is already correct (it pre-groups by constituency to avoid the `SUM DISTINCT` anti-pattern), so preserve this pattern in the optimized query.

**What to watch out for:** The column names in the query result must match what the Python code expects. The current code accesses `r["state_name"]`, `r["latest_year"]`, `r["total_const"]`, `r["avg_turnout"]`, `r["total_electors"]`, `r["ruling_party"]`, `r["ruling_seats"]`, `r["runner_up_party"]`, `r["runner_up_seats"]`. The optimized query must produce columns with these exact names.

Before modifying the query, capture the current output as a golden file: request `GET /v1/national/state-summary?election_type=AE` and `GET /v1/national/state-summary?election_type=GE`, save the JSON responses to `api/tests/fixtures/national_state_summary_ae.json` and `api/tests/fixtures/national_state_summary_ge.json`. After modifying the query, compare the new output against the golden files — any difference in state names, party names, seat counts, or turnout values indicates a regression.

**Verification:** Run `EXPLAIN ANALYZE` on the optimized query against the PostgreSQL database. The total execution time should be significantly lower than the original (target: under 100ms versus the original 500ms–2s). The endpoint response should match the golden file output. Request the endpoint via the API and verify the response time improvement.

---

#### Step 3.2: Reduce the Party Strength Endpoint from Three Queries to One

**What to do:** Combine the three sequential database queries in the `national_party_strength` endpoint into a single query that performs party normalization in SQL. The current implementation (in `national_routes.py` starting around line 150) executes: (1) a `GROUP BY party` query for seat counts, (2) a second `GROUP BY party` query for state counts, and (3) a third `GROUP BY party, state_name` query for per-state names. These are merged in Python code after retrieval. The three queries should be combined into a single query that normalizes party names using a SQL `CASE` expression and computes all dimensions in one `GROUP BY`.

**Where to do it:** The change is in `api/national_routes.py`, in the `national_party_strength` endpoint function.

**How it connects:** The party normalization logic currently exists in two places: the Python `_normalize_party` function (defined in `routes.py` and imported in `national_routes.py`) and the Python merge logic in the party strength endpoint. The SQL `CASE` expression replicates the `_PARTY_ALIASES` dictionary from `routes.py` in SQL, allowing PostgreSQL to normalize party names before grouping. This eliminates the need for the three-query Python merge pattern.

**Technology-specific guidance:** The SQL `CASE` expression should map each alias to its normalized form. The `_PARTY_ALIASES` dictionary in `routes.py` (around line 80) contains approximately 20 mappings. The SQL equivalent is: `CASE WHEN party IN ('INC(I)', 'INC (I)') THEN 'INC' WHEN party IN ('ADK', 'AIADMK', 'ADK(JL)') THEN 'ADMK' ... ELSE COALESCE(NULLIF(TRIM(party), ''), 'IND') END AS normalized_party`. Use this expression in the `SELECT` and `GROUP BY` clauses. The single combined query selects `normalized_party`, `COUNT(*) AS total_seats_won`, `COUNT(DISTINCT state_name) AS states_won_in`, `AVG(vote_share_percentage) AS avg_vote_share`, and `ARRAY_AGG(DISTINCT year ORDER BY year) AS years_active`, all from a single `GROUP BY normalized_party` with the usual `WHERE position = 1 AND ...` filters.

After the SQL normalization, the Python code simplifies dramatically: the result set from the single query is directly mapped to `NationalPartyStrength` objects without any merge logic. Remove the `merged` dictionary, the `norm_states` dictionary, and the three separate `pool.fetch` calls.

**What to watch out for:** The `_PARTY_ALIASES` dictionary may be updated in the future when new party name variations are discovered in election data. After moving the normalization logic to SQL, there are two places to update: the Python dictionary (used by other endpoints) and the SQL `CASE` expression (used by party strength). Document this dual-maintenance requirement clearly in a comment above the SQL query. Alternatively, keep the Python-side normalization and combine only the three queries into one by fetching party, state_name, year, and vote_share_percentage in a single query and doing the grouping in Python — this avoids the dual-maintenance issue at the cost of a slightly more complex Python aggregation, but still eliminates two database round-trips.

The weighted average vote share calculation in the current code uses a seat-weighted average. Ensure the optimized version preserves this weighting, not a simple average.

**Verification:** Capture the golden file before modification. After modification, compare the output against the golden file. The party names, seat counts, states_won_in values, and vote share values should match (or differ only due to the improved normalization of edge cases). Measure the endpoint response time — it should improve by approximately 200–300ms (the latency of the two eliminated database round-trips).

---

#### Step 3.3: Add Materialized Views for National Aggregation Endpoints

**What to do:** Create PostgreSQL materialized views that pre-compute the results for the three most expensive national queries: state summary, party strength, and turnout trends. The materialized views store the pre-computed results as regular database rows, and querying them takes under 5ms compared to 500ms–2s for the underlying CTE queries. The views are refreshed primarily through the data ingestion pipeline (triggered when new election data is loaded) with a fallback hourly cron refresh.

**Where to do it:** Create a new Alembic migration in `api/alembic/versions/` (numbered `0005` following the convention, since Step 1.5 creates `0004`). Add view-querying logic to the endpoint functions in `api/national_routes.py`. Add a materialized view refresh trigger to the data ingestion pipeline in `api/ingest.py` and the admin seed endpoint in `api/main.py`.

**How it connects:** Each national endpoint is modified to query the materialized view instead of running the full CTE query. The endpoint function checks whether the materialized view exists (using a try/except for the query, or checking `pg_matviews` system catalog), falling back to the original query if the view does not exist (for backward compatibility during migration). The `warm_cache` function is no longer needed for national endpoints because the materialized views serve the same purpose — but the Redis cache is still used on top of the materialized views to avoid even the 5ms view query on every request.

**Technology-specific guidance:** The Alembic migration creates three materialized views. Each view is defined with a `CREATE MATERIALIZED VIEW IF NOT EXISTS` statement followed by the optimized query from Steps 3.1 and 3.2. The view names should be `mv_national_state_summary`, `mv_national_party_strength`, and `mv_national_turnout_trends`. Each view should have a unique index on its natural key (e.g., `state_name` for the state summary view, `party` for the party strength view, `year` for the turnout trends view) to enable `REFRESH MATERIALIZED VIEW CONCURRENTLY`, which refreshes the view without locking reads.

The migration's `downgrade()` function must drop each materialized view: `DROP MATERIALIZED VIEW IF EXISTS mv_national_state_summary`, etc.

For the refresh trigger in the ingestion pipeline: in `api/ingest.py`'s `ingest_csv` function (which is called by the admin seed endpoint), add a call to refresh all three materialized views after data ingestion completes. This should be a separate function, e.g., `async def refresh_materialized_views(pool)`, that executes `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_national_state_summary` (and similarly for the other two views), followed by cache invalidation for the national cache keys. The admin cache-busting endpoint from Step 1.2 should also trigger a materialized view refresh.

For the fallback hourly refresh: create a PostgreSQL function and use `pg_cron` (if available on Cloud SQL) or an application-level scheduled task. The simplest approach is to add a periodic refresh in the FastAPI lifespan (similar to the `_usage_flush_loop`): an async loop that runs `REFRESH MATERIALIZED VIEW CONCURRENTLY` every hour. This runs in the application process and does not require PostgreSQL-level cron extensions.

**What to watch out for:** `REFRESH MATERIALIZED VIEW CONCURRENTLY` requires a unique index on the view and takes a shared lock on the view during refresh — it does not block reads, but it blocks other concurrent refresh operations. The refresh operation on a 574,000-row table should complete in 1–5 seconds. During refresh, the view serves slightly stale data (from the previous refresh), which is acceptable for election data that changes at most a few times per year.

Cloud SQL for PostgreSQL does not include `pg_cron` by default. The application-level hourly refresh (in the FastAPI lifespan loop) is the recommended approach. If the application crashes or restarts between refreshes, the materialized views remain available with their last-refreshed data — they are persistent database objects, not in-memory.

The materialized view creation in the `upgrade()` function of the Alembic migration must also include an initial `REFRESH MATERIALIZED VIEW` to populate the view with data. Without the initial refresh, the view exists but contains no rows, and queries against it return empty results.

**Verification:** After running the migration, connect to PostgreSQL and verify the views exist: `SELECT * FROM pg_matviews WHERE matviewname LIKE 'mv_national_%'`. Query the views directly: `SELECT * FROM mv_national_state_summary LIMIT 5` should return state summary data. Run `EXPLAIN ANALYZE SELECT * FROM mv_national_state_summary` — the query plan should show a sequential scan on the materialized view with execution time under 5ms. Test the materialized view refresh by ingesting new data via the admin endpoint and verifying the views reflect the new data. Request the national endpoints via the API and verify response times are under 50ms (from cache or materialized view).

---

#### Phase 3 Deliverables

At the end of Phase 3, the three national aggregation endpoints (state summary, party strength, turnout trends) serve results from materialized views in under 5ms (or from Redis cache in under 1ms). The party strength endpoint executes a single database query instead of three. All query modifications are covered by golden file regression tests. The materialized views are automatically refreshed on data ingestion and hourly as a fallback.

#### Phase 3 Risks and Mitigations

The primary risk is that the query rewrites in Steps 3.1 and 3.2 change the query semantics subtly, producing different results. Mitigation: golden file comparison before and after each change, with manual verification of any differences against Election Commission data.

The materialized view refresh in Step 3.3 adds a new failure mode: if the refresh fails (e.g., due to a disk space issue), the views serve stale data. Mitigation: the hourly fallback refresh will retry, and the Redis cache continues to serve the last-known-good data.

---

## 4. Cross-Cutting Concerns

### Error Handling Patterns

The codebase's established error handling pattern is to raise `HTTPException` with appropriate status codes for client errors (400, 401, 403, 404, 409) and let unexpected exceptions propagate to Sentry via the `sentry_sdk` integration (configured in `main.py`). This pattern should be preserved in all new code. The cache stampede protection (Step 1.8) should catch and log Redis lock errors without propagating them — Redis failures should degrade to direct database queries, not cause HTTP 500 errors. The materialized view queries in Phase 3 should catch `UndefinedTableError` (from asyncpg) and fall back to the original CTE queries, handling the case where the migration has not yet been run.

### Logging and Monitoring

The existing logging pattern uses Python's standard `logging` module with named loggers (e.g., `logging.getLogger("cache")`, `logging.getLogger("security")`). New logging in cache stampede protection should use the `cache` logger. New logging in materialized view refresh should use a `views` or `national` logger. Log at `INFO` level for successful operations (cache hit, view refresh completed) and `WARNING` for degraded operations (Redis unavailable, lock acquisition timeout, view refresh failed).

After all three phases are complete, integrate OpenTelemetry with Cloud Trace for production latency monitoring. This is a post-implementation follow-up, not part of the current scope, but the groundwork is laid by the structured logging added in these phases.

### Security Considerations

The admin cache-busting endpoint (Step 1.2) must use the existing `_require_admin` dependency from `admin_routes.py`, which checks `user.get("role") != "admin"` and returns HTTP 404 (not 403) to avoid revealing endpoint existence to non-admin users. The endpoint must be rate-limited to prevent abuse. The materialized view refresh endpoint (if exposed as an API — it may only be triggered internally) must also be admin-only.

No new authentication or authorization mechanisms are introduced. No new user input is accepted beyond the existing query parameters. The cache keys are derived from query parameters that are already validated by FastAPI's query parameter parsing.

### Performance Considerations

The optimizations in Phase 1 target the specific bottlenecks identified in the codebase: JSON serialization (orjson), excessive Pydantic validation (slim models), redundant database queries (cache TTL increase), cache incoherence (Redis consolidation), missing indexes (composite indexes), and cache stampede (distributed lock). Phase 3 targets the query execution bottleneck (materialized views). These optimizations are complementary — each addresses a different layer of the response pipeline.

The cumulative effect is estimated at 50–80% reduction in average response latency for the most-used endpoints, with worst-case latency (national aggregation on cold cache) improving from 500ms–2s to under 50ms.

### Accessibility

No frontend changes are made in any phase, so accessibility is not directly affected. The API response format changes (slim models) may affect screen reader or assistive technology tools that consume the API directly, but this is unlikely for a web application API.

---

## 5. Migration and Data Considerations

Phase 2 involves migrating data from Railway PostgreSQL to GCP Cloud SQL. Election data (the `tcpd_ae` table) can be loaded from CSV files using the existing seed infrastructure. User-generated data (users, bookmarks, votes, subscriptions, API keys, usage summaries) must be exported from Railway via `pg_dump --data-only` and imported into Cloud SQL via `psql`. Serial sequences must be updated after import to prevent primary key collisions.

Phase 3 adds materialized views via Alembic migrations. These are additive schema changes — no existing data is modified or deleted. The downgrade functions for each migration drop the materialized views, reverting the schema to its pre-migration state.

No data backfill or transformation is required. The election data format is unchanged.

Rollback for Phase 2: switch DNS back to the Railway deployment, which remains running for one week after cutover. Rollback for Phase 3: run `alembic downgrade -1` (or `-2` if both the index and view migrations need to be reverted) to drop the materialized views and new indexes.

---

## 6. Integration Points

### API Contracts (Frontend ↔ Backend)

The slim response models (Step 1.4) reduce the number of fields returned by list endpoints. The endpoint paths, request parameters, and response structure (JSON array of objects for lists, JSON object for details) remain identical. The frontend should be tested against the new responses to ensure no field dependencies are broken.

The `/v1/admin/cache/clear` endpoint (Step 1.2) is a new API surface. It accepts `POST` requests with admin authentication (JWT cookie with admin role) and an optional `prefix` query parameter. It returns a JSON object with the count of invalidated keys.

### Cache Integration (Application ↔ Redis)

After Step 1.3, all cache operations flow through `cache.py`'s Redis-backed system. Cache keys follow the pattern `endpoint_name:param1:param2` (e.g., `national_state_summary:AE`, `stats_summary:Tamil_Nadu:AE`). Lock keys for stampede protection follow the pattern `lock:cache_key`. Cache TTLs are 86,400 seconds for state-level data and 3,600 seconds for national data.

### Database Integration (Application ↔ PostgreSQL)

After Phase 3, the national endpoints query materialized views (`mv_national_state_summary`, `mv_national_party_strength`, `mv_national_turnout_trends`) instead of the base `tcpd_ae` table. The views are refreshed via the data ingestion pipeline and hourly background task. The view schema matches the column names expected by the endpoint Python code.

### Data Ingestion Pipeline (Admin ↔ Database ↔ Views)

The `ingest_csv` function in `api/ingest.py` and the admin seed endpoint in `api/main.py` are extended to trigger materialized view refresh after data loading. The refresh is an async operation that takes 1–5 seconds and does not block concurrent reads.

---

## 7. Configuration and Environment

### New Environment Variables

`WEB_CONCURRENCY=4` — uvicorn worker count (Step 1.6, set in Dockerfile default and overridable)

`REDIS_URL` — Upstash Redis connection URL for Cloud Run deployment (Step 2.1, format: `rediss://default:PASSWORD@ENDPOINT:PORT`)

`DB_SSL_VERIFY=false` — may be needed for Cloud SQL Unix socket connections (Step 2.3)

### Modified Environment Variables

No existing environment variables are changed. The `RATE_LIMIT_REQUESTS` variable may optionally be reduced from 100 to 50 if 4 workers cause concern about in-memory rate limiting bypass.

### New Dependencies

`orjson>=3.10.0` — added to `api/requirements.txt` (Step 1.1)

### Docker Configuration Changes

`api/Dockerfile` — change default `WEB_CONCURRENCY` from `'2'` to `'4'` (Step 1.6)

### Terraform Configuration Changes

`infra/terraform/main.tf` — add environment variable blocks for `REDIS_URL`, `WEB_CONCURRENCY`, `COOKIE_SECURE`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_PLAN_ID_PRO`, `SENTRY_DSN`, `FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY`, `SEED_SECRET` (Step 2.1)

`infra/terraform/variables.tf` — add variables for new sensitive values (Step 2.1)

`terraform.tfvars` — set `db_tier = "db-f1-micro"`, `db_ha_enabled = false` for cost optimization (Step 2.1)

---

## 8. Implementation Order and Dependencies

### Dependency Map

Steps 1.1, 1.2, 1.4, 1.5, 1.6, and 1.7 are fully independent and can be implemented in any order or in parallel. Step 1.3 (cache consolidation) is independent of other steps but should be done before Step 1.8 (stampede protection), which builds on the Redis cache. Step 1.8 depends on Step 1.3 being complete (stampede protection operates on the Redis cache, not the per-process dictionary). Phase 2 depends on Phase 1 being complete (deploy optimized code, not unoptimized). Phase 3, Step 3.1 depends on Step 1.7 (the electors fix should be in place). Phase 3, Step 3.3 depends on Steps 3.1 and 3.2 (the materialized views should use the optimized queries). Step 3.3 also depends on Step 1.5 (the Alembic migration for indexes should exist before the migration for views).

### Recommended Order for a Single Developer

1. Step 1.1 (orjson) — 15 minutes, immediate win
2. Step 1.6 (workers) — 5 minutes, immediate win
3. Step 1.2 (cache TTLs) — 30 minutes
4. Step 1.5 (indexes) — 30 minutes
5. Step 1.7 (electors fix) — 1–2 hours
6. Step 1.4 (slim models) — 2–4 hours
7. Step 1.3 (cache consolidation) — 1–2 hours
8. Step 1.8 (stampede protection) — 1–2 hours
9. Commit Phase 1 PR
10. Steps 2.0–2.5 (hosting migration) — 3–5 days
11. Commit Phase 2 PR
12. Step 3.1 (state summary rewrite) — 2–3 hours
13. Step 3.2 (party strength rewrite) — 2–3 hours
14. Step 3.3 (materialized views) — 3–5 hours
15. Commit Phase 3 PR
16. DNS cutover (Step 2.5, final validation)

### Parallelization for Multiple Developers

Developer A could work on Phase 1 (Steps 1.1–1.8) while Developer B sets up GCP prerequisites (Step 2.0) and reviews the Terraform configuration (Step 2.1). After Phase 1 merges, Developer A handles the deployment (Steps 2.2–2.5) while Developer B begins Phase 3 query optimization (Steps 3.1–3.2) on a separate branch. Step 3.3 (materialized views) should be done after Steps 3.1 and 3.2 merge.

---

## 9. Completion Criteria

### Phase 1 Completion

All eight steps are implemented and verified. The `orjson` dependency is in `requirements.txt` and `ORJSONResponse` is the default response class. Cache TTLs are 86,400 seconds for state data. The `_NATIONAL_CACHE` dictionary no longer exists in `national_routes.py`. Three new Pydantic models exist in `models.py`. Three new indexes exist on the `tcpd_ae` table. The Dockerfile defaults to 4 workers. The turnout trends query uses pre-grouped elector calculation. The `cache.py` module includes lock-based stampede protection. An admin cache-busting endpoint exists at `POST /v1/admin/cache/clear`. All existing endpoints return correct data. Performance benchmarks show improvement over baseline.

### Phase 2 Completion

The API is deployed on GCP Cloud Run in asia-south1 and responds to health checks. Cloud SQL contains all election and user data from Railway. The frontend is served from Cloud Storage with CDN. The Global Load Balancer routes traffic correctly. Performance benchmarks from a Mumbai-region client show sub-500ms p95 latency. The Railway deployment remains running as a fallback.

### Phase 3 Completion

The national state summary query uses the optimized CTE structure. The party strength endpoint executes one query instead of three. Three materialized views exist in the database. Materialized views are refreshed on data ingestion and hourly. Golden file comparisons confirm no data regressions (except the intentional electors fix from Step 1.7). National endpoint response times are under 50ms from materialized views or under 1ms from Redis cache.

### Overall Completion

DNS is pointed to the GCP deployment. All endpoints respond correctly with improved performance. The Railway deployment has been running in parallel for one week without issues. Documentation (README, OPERATIONS.md) is updated.

---

## 10. Implementation Report Summary

This report decomposes the tech stack optimization plan for the Indian election analytics platform into 16 concrete implementation steps across three phases, totaling approximately 11 development days. Phase 1 (two days, eight steps) delivers application-level performance optimizations: orjson serialization, increased cache TTLs, Redis cache consolidation, slim Pydantic models, composite database indexes, increased worker count, electorate calculation fix, and cache stampede protection — all within the existing codebase with no infrastructure changes. Phase 2 (five days, six steps) migrates hosting from free-tier Railway to GCP Cloud Run Mumbai using the existing Terraform configuration, with targeted cost optimizations (db-f1-micro at $8.50/month, Upstash Redis free tier). Phase 3 (four days, three steps) rewrites the national aggregation queries and adds materialized views for sub-5ms response times.

The critical dependency chain is: Phase 1 → Phase 2 → Phase 3 → DNS cutover. Within Phase 1, most steps are independent and can be done in any order; only Step 1.8 depends on Step 1.3. The key decision point is the GCP setup in Phase 2 — if GCP is not viable, DigitalOcean Bangalore is an alternative hosting target. The key risk is that the Cloud SQL Unix socket connection may require a small fix to `database.py`'s SSL context logic.

No code is rewritten in a different language. No database schema is destructively modified. No frontend changes are required. The platform achieves production-grade performance with Indian-region hosting, auto-scaling, and dramatically reduced response latency — all grounded in the specific files, functions, and patterns already present in the codebase.
