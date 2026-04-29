import asyncio
import ipaddress
import os
import time
import logging
from collections import defaultdict
from contextlib import asynccontextmanager

import sentry_sdk

from fastapi import FastAPI, Request, Response, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, ORJSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.gzip import GZipMiddleware

from database import close_pool, get_pool
from routes import router
from auth_routes import auth_router
from bookmark_routes import bookmark_router
from national_routes import router as national_router
from og_routes import og_router
from payment_routes import payment_router, webhook_router
from admin_routes import admin_router
from export_routes import export_router
from apikey_routes import apikey_router

# ---------------------------------------------------------------------------
# Sentry error tracking (no-op if DSN not set)
# ---------------------------------------------------------------------------
_sentry_dsn = os.environ.get("SENTRY_DSN", "")
if _sentry_dsn:
    sentry_sdk.init(
        dsn=_sentry_dsn,
        traces_sample_rate=0.1,
        send_default_pii=False,
    )

# ---------------------------------------------------------------------------
# Security logging
# ---------------------------------------------------------------------------
logger = logging.getLogger("security")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

# Max request body size (10 MB default, 50 MB for admin seed)
MAX_BODY_SIZE = int(os.environ.get("MAX_BODY_SIZE", str(10 * 1024 * 1024)))
MAX_ADMIN_BODY_SIZE = int(os.environ.get("MAX_ADMIN_BODY_SIZE", str(50 * 1024 * 1024)))


# ---------------------------------------------------------------------------
# Rate limiting — per-IP sliding window
# ---------------------------------------------------------------------------
RATE_LIMIT_REQUESTS = int(os.environ.get("RATE_LIMIT_REQUESTS", "100"))
RATE_LIMIT_WINDOW = int(os.environ.get("RATE_LIMIT_WINDOW", "60"))  # seconds

_rate_store: dict[str, list[float]] = defaultdict(list)
_rate_store_max_keys = 10_000  # Evict oldest entries if exceeded


async def _redis_rate_check(key: str, limit: int, window: int) -> tuple[bool, int]:
    """Check rate limit using Redis sorted sets. Returns (allowed, current_count).
    Falls back to (True, 0) if Redis unavailable."""
    try:
        from cache import _get_redis
        r = await _get_redis()
        if not r:
            return True, 0  # fall through to in-memory
        now = time.time()
        pipe = r.pipeline()
        pipe.zremrangebyscore(key, 0, now - window)
        pipe.zadd(key, {str(now): now})
        pipe.zcard(key)
        pipe.expire(key, window)
        results = await pipe.execute()
        count = results[2]
        return count <= limit, count
    except Exception:
        return True, 0  # fall through to in-memory

# Paths exempt from rate limiting
_RATE_EXEMPT = {"/health", "/docs", "/openapi.json", "/redoc"}

# Stricter rate limits for auth endpoints (prevent brute force)
_AUTH_RATE_LIMIT = 10  # max 10 auth requests per window
_AUTH_PATHS = {"/auth/verify-otp", "/auth/google-link"}
_auth_rate_store: dict[str, list[float]] = defaultdict(list)

# Trusted proxy CIDR ranges for X-Forwarded-For parsing

_TRUSTED_PROXIES: list[ipaddress.IPv4Network | ipaddress.IPv6Network] = []
_trusted_proxies_raw = os.environ.get("TRUSTED_PROXIES", "")
if _trusted_proxies_raw:
    for cidr in _trusted_proxies_raw.split(","):
        cidr = cidr.strip()
        if cidr:
            try:
                _TRUSTED_PROXIES.append(ipaddress.ip_network(cidr, strict=False))
            except ValueError:
                logger.warning("Invalid CIDR in TRUSTED_PROXIES: %s", cidr)
elif not _trusted_proxies_raw:
    logger.info("TRUSTED_PROXIES not configured; rate limiter uses direct client IP")


def _get_client_ip(request: Request) -> str:
    """Extract the real client IP, handling reverse proxies."""
    direct_ip = request.client.host if request.client else "unknown"
    if direct_ip == "unknown":
        return direct_ip

    # Only trust proxy headers if the connecting IP is a known proxy
    is_trusted = False
    if _TRUSTED_PROXIES:
        try:
            addr = ipaddress.ip_address(direct_ip)
            is_trusted = any(addr in net for net in _TRUSTED_PROXIES)
        except ValueError:
            pass

    if not is_trusted and _TRUSTED_PROXIES:
        return direct_ip

    # Check X-Real-IP first (simpler, set by most proxies)
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()

    # Parse X-Forwarded-For — take the leftmost (client) IP
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        # First IP in the chain is the original client
        client_ip = forwarded.split(",")[0].strip()
        if client_ip:
            return client_ip

    return direct_ip


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path in _RATE_EXEMPT:
            return await call_next(request)

        # Enforce request body size limits
        content_length = request.headers.get("content-length")
        if content_length:
            size = int(content_length)
            limit = MAX_ADMIN_BODY_SIZE if path.startswith("/admin/") else MAX_BODY_SIZE
            if size > limit:
                return JSONResponse(
                    status_code=413,
                    content={"detail": "Request body too large"},
                )

        client_ip = _get_client_ip(request)

        now = time.time()
        window_start = now - RATE_LIMIT_WINDOW

        # Try Redis rate limiting first
        redis_allowed, redis_count = await _redis_rate_check(
            f"rate:{client_ip}", RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW
        )
        if not redis_allowed:
            logger.warning("Rate limit exceeded (Redis): ip=%s path=%s", client_ip, path)
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please slow down."},
                headers={"Retry-After": str(RATE_LIMIT_WINDOW)},
            )

        # In-memory fallback (used when Redis unavailable)
        # Clean old entries and append current
        hits = _rate_store[client_ip]
        _rate_store[client_ip] = [t for t in hits if t > window_start]
        _rate_store[client_ip].append(now)

        # Evict stale IPs to prevent memory leak
        if len(_rate_store) > _rate_store_max_keys:
            stale = [ip for ip, ts in _rate_store.items()
                     if not ts or ts[-1] < window_start]
            for ip in stale:
                del _rate_store[ip]

        if len(_rate_store[client_ip]) > RATE_LIMIT_REQUESTS:
            logger.warning("Rate limit exceeded: ip=%s path=%s", client_ip, path)
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please slow down."},
                headers={"Retry-After": str(RATE_LIMIT_WINDOW)},
            )

        # Stricter limit for auth endpoints (brute-force protection)
        if path in _AUTH_PATHS:
            auth_hits = _auth_rate_store[client_ip]
            _auth_rate_store[client_ip] = [t for t in auth_hits if t > window_start]
            _auth_rate_store[client_ip].append(now)
            if len(_auth_rate_store[client_ip]) > _AUTH_RATE_LIMIT:
                logger.warning("Auth rate limit exceeded: ip=%s path=%s", client_ip, path)
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Too many authentication attempts. Please try later."},
                    headers={"Retry-After": str(RATE_LIMIT_WINDOW * 5)},
                )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(RATE_LIMIT_REQUESTS)
        response.headers["X-RateLimit-Remaining"] = str(
            max(0, RATE_LIMIT_REQUESTS - len(_rate_store[client_ip]))
        )

        # Record usage asynchronously (fire-and-forget)
        elapsed_ms = int((time.time() - now) * 1000)
        user_id = None
        api_key_id = None
        if hasattr(request.state, "user"):
            u = request.state.user
            if u:
                user_id = int(u.get("sub", 0)) or None
                api_key_id = u.get("api_key_id")
        asyncio.create_task(_record_usage(user_id, api_key_id, path, elapsed_ms))

        return response


import uuid as _uuid


class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or str(_uuid.uuid4())
        request.state.request_id = request_id
        response: Response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=()"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' https://apis.google.com https://*.firebaseio.com https://*.gstatic.com; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https://*.googleusercontent.com; "
            "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://identitytoolkit.googleapis.com; "
            "frame-src https://accounts.google.com https://*.firebaseapp.com; "
            "object-src 'none'; "
            "base-uri 'self'"
        )
        return response


# Paths exempt from CSRF verification (safe methods are also exempt)
_CSRF_EXEMPT = {"/health", "/docs", "/openapi.json", "/redoc",
                 "/auth/verify-otp", "/auth/logout",
                 "/v1/auth/verify-otp", "/v1/auth/logout"}
_CSRF_EXEMPT_PREFIXES = ("/webhooks/", "/v1/webhooks/")


class CSRFMiddleware(BaseHTTPMiddleware):
    """Double-submit cookie CSRF protection.

    For state-changing requests (POST, PUT, DELETE), verify that the
    X-CSRF-Token header matches the csrf_token cookie value.
    Exempt: safe methods, login/webhook endpoints, Bearer-token-authenticated requests.
    """
    async def dispatch(self, request: Request, call_next):
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return await call_next(request)

        path = request.url.path
        if path in _CSRF_EXEMPT or any(path.startswith(p) for p in _CSRF_EXEMPT_PREFIXES):
            return await call_next(request)

        # Skip CSRF check for Bearer-token-authenticated requests (API keys, etc.)
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            return await call_next(request)

        # Verify CSRF double-submit cookie
        csrf_cookie = request.cookies.get("csrf_token")
        csrf_header = request.headers.get("x-csrf-token")
        if not csrf_cookie or not csrf_header or csrf_cookie != csrf_header:
            return JSONResponse(
                status_code=403,
                content={"detail": "CSRF validation failed"},
            )

        return await call_next(request)


# ---------------------------------------------------------------------------
# Usage metering — in-memory counters flushed to DB periodically
# ---------------------------------------------------------------------------
USAGE_FLUSH_INTERVAL = int(os.environ.get("USAGE_FLUSH_INTERVAL", "300"))  # seconds
FREE_TIER_MONTHLY_LIMIT = int(os.environ.get("FREE_TIER_MONTHLY_LIMIT", "1000"))
PRO_TIER_MONTHLY_LIMIT = int(os.environ.get("PRO_TIER_MONTHLY_LIMIT", "10000"))

# key: (user_id_or_ip, api_key_id_or_none, date_str, endpoint_group)
_usage_counters: dict[tuple, dict] = {}
_usage_lock = asyncio.Lock()


def _endpoint_group(path: str) -> str:
    """Classify an endpoint into a metering group."""
    if path.startswith(("/v1/export", "/export")):
        return "export"
    if path.startswith(("/v1/national", "/national")):
        return "national"
    if path.startswith(("/v1/predict", "/predict")):
        return "predictions"
    if path.startswith(("/v1/auth", "/auth")):
        return "auth"
    return "data"


async def _record_usage(user_id: int | None, api_key_id: int | None, path: str, response_time_ms: int):
    from datetime import date
    key = (user_id, api_key_id, str(date.today()), _endpoint_group(path))
    async with _usage_lock:
        if key not in _usage_counters:
            _usage_counters[key] = {"count": 0, "time_ms": 0}
        _usage_counters[key]["count"] += 1
        _usage_counters[key]["time_ms"] += response_time_ms


async def _flush_usage():
    """Flush accumulated usage counters to the database."""
    async with _usage_lock:
        if not _usage_counters:
            return
        snapshot = dict(_usage_counters)
        _usage_counters.clear()

    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            for (uid, akid, date_str, group), vals in snapshot.items():
                await conn.execute(
                    """INSERT INTO usage_summary (user_id, api_key_id, date, endpoint_group, request_count, total_response_time_ms)
                       VALUES ($1, $2, $3::date, $4, $5, $6)
                       ON CONFLICT DO NOTHING""",
                    uid, akid, date_str, group, vals["count"], vals["time_ms"],
                )
    except Exception:
        # On flush failure, data is lost — acceptable for metering
        logging.getLogger("usage").warning("Failed to flush usage counters")


async def _usage_flush_loop():
    while True:
        await asyncio.sleep(USAGE_FLUSH_INTERVAL)
        await _flush_usage()


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool = await get_pool()
    # Auto-create tables if they don't exist (for managed DB like Railway)
    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS tcpd_ae (
                id SERIAL PRIMARY KEY,
                state_name TEXT,
                assembly_no INTEGER,
                constituency_no INTEGER NOT NULL,
                year INTEGER NOT NULL,
                month INTEGER,
                delim_id INTEGER,
                poll_no INTEGER,
                position INTEGER,
                candidate TEXT NOT NULL,
                sex TEXT,
                party TEXT,
                votes INTEGER,
                age INTEGER,
                candidate_type TEXT,
                valid_votes INTEGER,
                electors INTEGER,
                constituency_name TEXT NOT NULL,
                constituency_type TEXT,
                district_name TEXT,
                sub_region TEXT,
                n_cand INTEGER,
                turnout_percentage NUMERIC,
                vote_share_percentage NUMERIC,
                deposit_lost TEXT,
                margin INTEGER,
                margin_percentage NUMERIC,
                enop NUMERIC,
                pid TEXT,
                party_type_tcpd TEXT,
                party_id INTEGER,
                last_poll TEXT,
                contested INTEGER,
                last_party TEXT,
                last_party_id TEXT,
                last_constituency_name TEXT,
                same_constituency TEXT,
                same_party TEXT,
                no_terms INTEGER,
                turncoat TEXT,
                incumbent TEXT,
                recontest TEXT,
                myneta_education TEXT,
                tcpd_prof_main TEXT,
                tcpd_prof_main_desc TEXT,
                tcpd_prof_second TEXT,
                tcpd_prof_second_desc TEXT,
                election_type TEXT
            );
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                mobile TEXT UNIQUE NOT NULL,
                display_name TEXT NOT NULL DEFAULT 'Analyst',
                google_id TEXT UNIQUE,
                google_email TEXT,
                avatar_url TEXT,
                date_of_birth DATE,
                role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            CREATE TABLE IF NOT EXISTS bookmarks (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                description TEXT DEFAULT '',
                params JSONB NOT NULL,
                is_public BOOLEAN NOT NULL DEFAULT false,
                like_count INTEGER NOT NULL DEFAULT 0,
                dislike_count INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            CREATE TABLE IF NOT EXISTS votes (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                bookmark_id INTEGER NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
                vote_type TEXT NOT NULL CHECK (vote_type IN ('like', 'dislike')),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                UNIQUE(user_id, bookmark_id)
            );
        """)
        # Create indexes if they don't exist (idempotent)
        for stmt in [
            "CREATE INDEX IF NOT EXISTS idx_tcpd_year ON tcpd_ae(year)",
            "CREATE INDEX IF NOT EXISTS idx_tcpd_party ON tcpd_ae(party)",
            "CREATE INDEX IF NOT EXISTS idx_tcpd_constituency ON tcpd_ae(constituency_name)",
            "CREATE INDEX IF NOT EXISTS idx_tcpd_district ON tcpd_ae(district_name)",
            "CREATE INDEX IF NOT EXISTS idx_tcpd_position ON tcpd_ae(position)",
            "CREATE INDEX IF NOT EXISTS idx_tcpd_year_position ON tcpd_ae(year, position)",
            "CREATE INDEX IF NOT EXISTS idx_tcpd_year_constituency ON tcpd_ae(year, constituency_no)",
            # Multi-state composite indexes
            "CREATE INDEX IF NOT EXISTS idx_tcpd_state_year ON tcpd_ae(state_name, year)",
            "CREATE INDEX IF NOT EXISTS idx_tcpd_state_const_year ON tcpd_ae(state_name, constituency_name, year)",
            "CREATE INDEX IF NOT EXISTS idx_tcpd_state_year_pos ON tcpd_ae(state_name, year, position)",
            "CREATE INDEX IF NOT EXISTS idx_tcpd_election_type ON tcpd_ae(election_type)",
            "CREATE INDEX IF NOT EXISTS idx_tcpd_state_election_type ON tcpd_ae(state_name, election_type)",
            "CREATE INDEX IF NOT EXISTS idx_tcpd_state_poll ON tcpd_ae(state_name, poll_no)",
            # National query composite indexes
            "CREATE INDEX IF NOT EXISTS idx_tcpd_state_pos_et ON tcpd_ae(state_name, position, election_type)",
            "CREATE INDEX IF NOT EXISTS idx_tcpd_party_state_year ON tcpd_ae(party, state_name, year)",
            "CREATE INDEX IF NOT EXISTS idx_users_mobile ON users(mobile)",
            "CREATE INDEX IF NOT EXISTS idx_users_google ON users(google_id)",
            "CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id)",
            "CREATE INDEX IF NOT EXISTS idx_bookmarks_created ON bookmarks(created_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_votes_bookmark ON votes(bookmark_id)",
        ]:
            await conn.execute(stmt)

    # Warm national caches in background (non-blocking)
    async def _warm():
        try:
            from national_routes import warm_cache
            await warm_cache()
        except Exception:
            pass
    asyncio.create_task(_warm())

    # Start usage metering flush loop
    flush_task = asyncio.create_task(_usage_flush_loop())

    # Hourly materialized view refresh loop
    async def _mv_refresh_loop():
        while True:
            await asyncio.sleep(3600)
            try:
                from national_routes import refresh_materialized_views
                await refresh_materialized_views()
            except Exception:
                pass

    mv_task = asyncio.create_task(_mv_refresh_loop())

    yield

    # Shutdown: flush remaining usage data and close pool
    flush_task.cancel()
    mv_task.cancel()
    await _flush_usage()
    await close_pool()


ALLOWED_ORIGINS = os.environ.get(
    "ALLOWED_ORIGINS", "http://localhost:5173"
).split(",")

_disable_docs = os.environ.get("DISABLE_DOCS", "").lower() in ("1", "true", "yes")

app = FastAPI(
    title="Election Analysis API",
    description=(
        "REST API for TCPD Assembly Election data, predictions, "
        "bookmarks and community features."
    ),
    version="2.0.0",
    lifespan=lifespan,
    default_response_class=ORJSONResponse,
    docs_url=None if _disable_docs else "/docs",
    redoc_url=None if _disable_docs else "/redoc",
    openapi_url=None if _disable_docs else "/openapi.json",
)

app.add_middleware(RequestIDMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(CSRFMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(GZipMiddleware, minimum_size=1000)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
    allow_credentials=True,
)

# ── Versioned API routes (/v1/) ─────────────────────────────
v1 = APIRouter(prefix="/v1")
v1.include_router(router)
v1.include_router(auth_router, prefix="/auth", tags=["auth"])
v1.include_router(bookmark_router, prefix="/bookmarks", tags=["bookmarks"])
v1.include_router(national_router)
v1.include_router(payment_router)
v1.include_router(webhook_router)
v1.include_router(admin_router)
v1.include_router(export_router)
v1.include_router(apikey_router)
app.include_router(v1)

# Legacy unprefixed routes (deprecation period)
app.include_router(router)
app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(bookmark_router, prefix="/bookmarks", tags=["bookmarks"])
app.include_router(national_router)

# Non-versioned routes
app.include_router(og_router)


@app.get("/health", tags=["infra"])
async def health():
    """Health check for deployment platforms (Railway, Render, Fly, etc.)."""
    pool = await get_pool()
    await pool.fetchval("SELECT 1")
    return {"status": "ok"}


def _verify_admin(request: Request):
    """Verify admin secret and log the attempt. Raises 404 if unauthorized."""
    # Admin endpoints can be completely disabled via env var
    if os.environ.get("DISABLE_ADMIN", "").lower() in ("1", "true", "yes"):
        raise HTTPException(status_code=404, detail="Not found")
    seed_secret = os.environ.get("SEED_SECRET", "")
    auth_header = request.headers.get("Authorization", "")
    client_ip = request.client.host if request.client else "unknown"
    if not seed_secret or auth_header != f"Bearer {seed_secret}":
        logger.warning("Unauthorized admin attempt: ip=%s path=%s", client_ip, request.url.path)
        raise HTTPException(status_code=404, detail="Not found")
    logger.info("Admin action: ip=%s path=%s", client_ip, request.url.path)


@app.post("/admin/seed", tags=["infra"])
async def seed_data(request: Request, append: bool = False):
    """Seed the database with CSV data sent via POST body.
    By default only works when the table is empty (safety check).
    Pass ?append=true to add data to an existing table.
    Expects: CSV text in request body with Content-Type text/csv.
    """
    import csv
    import io

    _verify_admin(request)

    pool = await get_pool()

    if not append:
        existing = await pool.fetchval("SELECT COUNT(*) FROM tcpd_ae")
        if existing > 0:
            return JSONResponse(
                status_code=409,
                content={"detail": f"Table already has {existing} rows. Truncate first or use ?append=true.", "rows": existing},
            )

    body = await request.body()
    text = body.decode("utf-8")
    reader = csv.DictReader(io.StringIO(text))

    columns = [
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

    # Use asyncpg copy_to_table for fast bulk insert — send as tab-delimited text
    # Process in batches to limit memory usage for large CSVs (483K rows)
    import io as _io
    BATCH_SIZE = 50_000
    row_count = 0
    batch_buf = _io.BytesIO()
    batch_count = 0

    try:
        async with pool.acquire() as conn:
            # Drop unique index if exists so COPY doesn't fail on CSV duplicates
            await conn.execute("DROP INDEX IF EXISTS idx_tcpd_unique_entry")

            for row in reader:
                lc_row = {k.lower(): v for k, v in row.items()}
                vals = []
                for col in columns:
                    v = lc_row.get(col, "")
                    vals.append(v if v != "" else "\\N")
                batch_buf.write(("\t".join(vals) + "\n").encode("utf-8"))
                row_count += 1
                batch_count += 1

                if batch_count >= BATCH_SIZE:
                    batch_buf.seek(0)
                    await conn.copy_to_table(
                        "tcpd_ae", columns=columns,
                        source=batch_buf, format="text", schema_name="public",
                    )
                    batch_buf = _io.BytesIO()
                    batch_count = 0

            # Flush remaining rows
            if batch_count > 0:
                batch_buf.seek(0)
                await conn.copy_to_table(
                    "tcpd_ae", columns=columns,
                    source=batch_buf, format="text", schema_name="public",
                )
    except Exception as e:
        logger.error("Seed failed: %s", e)
        return JSONResponse(status_code=500, content={"detail": "Seed failed. Check server logs."})

    # Deduplicate (state-scoped)
    await pool.execute("""
        DELETE FROM tcpd_ae a USING tcpd_ae b
        WHERE a.id > b.id
          AND a.state_name = b.state_name
          AND a.year = b.year
          AND a.constituency_no = b.constituency_no
          AND a.candidate = b.candidate
          AND a.poll_no IS NOT DISTINCT FROM b.poll_no
    """)
    await pool.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_tcpd_unique_entry
          ON tcpd_ae (state_name, year, constituency_no, candidate, COALESCE(poll_no, 0), COALESCE(election_type, ''))
    """)
    final_count = await pool.fetchval("SELECT COUNT(*) FROM tcpd_ae")

    return {"detail": "Seeded successfully", "rows_parsed": row_count, "final_count": final_count}


@app.post("/admin/dedup", tags=["infra"])
async def dedup_data(request: Request):
    """Deduplicate tcpd_ae table and create unique index."""
    _verify_admin(request)

    pool = await get_pool()
    before = await pool.fetchval("SELECT COUNT(*) FROM tcpd_ae")
    await pool.execute("""
        DELETE FROM tcpd_ae a USING tcpd_ae b
        WHERE a.id > b.id
          AND a.state_name = b.state_name
          AND a.year = b.year
          AND a.constituency_no = b.constituency_no
          AND a.candidate = b.candidate
          AND a.poll_no IS NOT DISTINCT FROM b.poll_no
    """)
    await pool.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_tcpd_unique_entry
          ON tcpd_ae (state_name, year, constituency_no, candidate, COALESCE(poll_no, 0), COALESCE(election_type, ''))
    """)
    after = await pool.fetchval("SELECT COUNT(*) FROM tcpd_ae")
    return {"before": before, "after": after, "removed": before - after}


@app.post("/admin/truncate", tags=["infra"])
async def truncate_data(request: Request):
    """Truncate tcpd_ae table."""
    _verify_admin(request)

    pool = await get_pool()
    before = await pool.fetchval("SELECT COUNT(*) FROM tcpd_ae")
    await pool.execute("TRUNCATE tcpd_ae RESTART IDENTITY")
    return {"detail": "Truncated", "rows_removed": before}


@app.post("/admin/create-views", tags=["infra"])
async def create_materialized_views(request: Request):
    """Create (or recreate) national materialized views."""
    _verify_admin(request)

    pool = await get_pool()
    results = {}

    # State Summary
    await pool.execute("DROP MATERIALIZED VIEW IF EXISTS mv_national_state_summary CASCADE")
    await pool.execute("""
        CREATE MATERIALIZED VIEW mv_national_state_summary AS
        WITH latest AS (
            SELECT state_name, election_type, MAX(year) AS latest_year
            FROM tcpd_ae WHERE (poll_no = 0 OR poll_no IS NULL) AND state_name IS NOT NULL
            GROUP BY state_name, election_type
        ),
        filtered AS (
            SELECT t.* FROM tcpd_ae t JOIN latest l
            ON t.state_name = l.state_name AND t.year = l.latest_year AND t.election_type = l.election_type
            WHERE (t.poll_no = 0 OR t.poll_no IS NULL)
        ),
        winners AS (SELECT state_name, election_type, party, COUNT(*) AS seats_won FROM filtered WHERE position = 1 GROUP BY state_name, election_type, party),
        ranked AS (SELECT state_name, election_type, party, seats_won, ROW_NUMBER() OVER (PARTITION BY state_name, election_type ORDER BY seats_won DESC) AS rn FROM winners),
        turnout AS (SELECT state_name, election_type, AVG(turnout_percentage) AS avg_turnout, COUNT(DISTINCT constituency_name) AS total_const FROM filtered WHERE position = 1 GROUP BY state_name, election_type),
        electors AS (SELECT state_name, election_type, SUM(max_e) AS total_electors FROM (SELECT state_name, election_type, constituency_no, MAX(electors) AS max_e FROM filtered GROUP BY state_name, election_type, constituency_no) sub GROUP BY state_name, election_type)
        SELECT l.state_name, l.election_type, l.latest_year, tu.total_const, tu.avg_turnout, el.total_electors,
               r1.party AS ruling_party, r1.seats_won AS ruling_seats, r2.party AS runner_up_party, r2.seats_won AS runner_up_seats
        FROM latest l
        LEFT JOIN ranked r1 ON l.state_name = r1.state_name AND l.election_type = r1.election_type AND r1.rn = 1
        LEFT JOIN ranked r2 ON l.state_name = r2.state_name AND l.election_type = r2.election_type AND r2.rn = 2
        LEFT JOIN turnout tu ON l.state_name = tu.state_name AND l.election_type = tu.election_type
        LEFT JOIN electors el ON l.state_name = el.state_name AND l.election_type = el.election_type
        ORDER BY l.state_name
    """)
    await pool.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_state_summary_pk ON mv_national_state_summary(state_name, election_type)")
    results["mv_national_state_summary"] = await pool.fetchval("SELECT COUNT(*) FROM mv_national_state_summary")

    # Party Strength
    await pool.execute("DROP MATERIALIZED VIEW IF EXISTS mv_national_party_strength CASCADE")
    await pool.execute("""
        CREATE MATERIALIZED VIEW mv_national_party_strength AS
        SELECT
            CASE WHEN party IN ('INC(I)', 'INC (I)') THEN 'INC'
                 WHEN party IN ('ADK', 'AIADMK', 'ADK(JL)') THEN 'ADMK'
                 WHEN party IN ('BHP', 'B.J.P', 'B.J.P.') THEN 'BJP'
                 WHEN party IN ('S.P', 'S.P.') THEN 'SP'
                 WHEN party IN ('JD(S)', 'JD (S)') THEN 'JDS'
                 WHEN party IN ('JD(U)', 'JD (U)') THEN 'JDU'
                 WHEN party IN ('B.S.P.', 'B.S.P', 'BSP(K)', 'BSP (K)') THEN 'BSP'
                 WHEN party IN ('SHS', 'ShivSena', 'SHIV SENA') THEN 'SS'
                 WHEN party = 'TRS' THEN 'BRS'
                 ELSE COALESCE(NULLIF(TRIM(party), ''), 'IND')
            END AS normalized_party,
            election_type, COUNT(DISTINCT state_name) AS states_won_in, COUNT(*) AS total_seats_won,
            AVG(vote_share_percentage) AS avg_vote_share, ARRAY_AGG(DISTINCT year ORDER BY year) AS years_active
        FROM tcpd_ae WHERE position = 1 AND (poll_no = 0 OR poll_no IS NULL) AND party IS NOT NULL
          AND state_name NOT IN ('Mysore', 'Madras', 'Goa_Daman_&_Diu', 'Goa,_Daman_&_Diu')
        GROUP BY normalized_party, election_type ORDER BY total_seats_won DESC
    """)
    await pool.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_party_strength_pk ON mv_national_party_strength(normalized_party, election_type)")
    results["mv_national_party_strength"] = await pool.fetchval("SELECT COUNT(*) FROM mv_national_party_strength")

    # Turnout Trends
    await pool.execute("DROP MATERIALIZED VIEW IF EXISTS mv_national_turnout_trends CASCADE")
    await pool.execute("""
        CREATE MATERIALIZED VIEW mv_national_turnout_trends AS
        WITH per_constituency AS (
            SELECT year, election_type, state_name, constituency_no,
                   MAX(electors) AS max_electors,
                   MAX(CASE WHEN position = 1 THEN turnout_percentage END) AS turnout_pct
            FROM tcpd_ae WHERE (poll_no = 0 OR poll_no IS NULL)
              AND state_name NOT IN ('Mysore', 'Madras', 'Goa_Daman_&_Diu', 'Goa,_Daman_&_Diu')
            GROUP BY year, election_type, state_name, constituency_no
        )
        SELECT year, election_type, AVG(turnout_pct) AS avg_turnout, SUM(max_electors) AS total_electors,
               COUNT(DISTINCT state_name) AS states_counted
        FROM per_constituency WHERE turnout_pct IS NOT NULL
        GROUP BY year, election_type ORDER BY year
    """)
    await pool.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_turnout_trends_pk ON mv_national_turnout_trends(year, election_type)")
    results["mv_national_turnout_trends"] = await pool.fetchval("SELECT COUNT(*) FROM mv_national_turnout_trends")

    total_rows = await pool.fetchval("SELECT COUNT(*) FROM tcpd_ae")
    return {"detail": "Materialized views created", "views": results, "total_rows": total_rows}
