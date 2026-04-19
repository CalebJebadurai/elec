import os
import time
from collections import defaultdict
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from database import close_pool, get_pool
from routes import router
from auth_routes import auth_router
from bookmark_routes import bookmark_router


# ---------------------------------------------------------------------------
# Rate limiting — per-IP sliding window
# ---------------------------------------------------------------------------
RATE_LIMIT_REQUESTS = int(os.environ.get("RATE_LIMIT_REQUESTS", "100"))
RATE_LIMIT_WINDOW = int(os.environ.get("RATE_LIMIT_WINDOW", "60"))  # seconds

_rate_store: dict[str, list[float]] = defaultdict(list)
_rate_store_max_keys = 10_000  # Evict oldest entries if exceeded

# Paths exempt from rate limiting
_RATE_EXEMPT = {"/health", "/docs", "/openapi.json", "/redoc"}

# Stricter rate limits for auth endpoints (prevent brute force)
_AUTH_RATE_LIMIT = 10  # max 10 auth requests per window
_AUTH_PATHS = {"/auth/verify-otp", "/auth/google-link"}
_auth_rate_store: dict[str, list[float]] = defaultdict(list)


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path in _RATE_EXEMPT:
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"

        now = time.time()
        window_start = now - RATE_LIMIT_WINDOW

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
                votes INTEGER NOT NULL,
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
            "CREATE INDEX IF NOT EXISTS idx_users_mobile ON users(mobile)",
            "CREATE INDEX IF NOT EXISTS idx_users_google ON users(google_id)",
            "CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id)",
            "CREATE INDEX IF NOT EXISTS idx_bookmarks_created ON bookmarks(created_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_votes_bookmark ON votes(bookmark_id)",
        ]:
            await conn.execute(stmt)
    yield
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
    docs_url=None if _disable_docs else "/docs",
    redoc_url=None if _disable_docs else "/redoc",
    openapi_url=None if _disable_docs else "/openapi.json",
)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
    allow_credentials=True,
)

app.include_router(router)
app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(bookmark_router, prefix="/bookmarks", tags=["bookmarks"])


@app.get("/health", tags=["infra"])
async def health():
    """Health check for deployment platforms (Railway, Render, Fly, etc.)."""
    pool = await get_pool()
    await pool.fetchval("SELECT 1")
    return {"status": "ok"}


@app.post("/admin/seed", tags=["infra"])
async def seed_data(request: Request):
    """Seed the database with CSV data sent via POST body.
    Only works when the tcpd_ae table is empty (safety check).
    Expects: CSV text in request body with Content-Type text/csv.
    """
    import csv
    import io

    seed_secret = os.environ.get("SEED_SECRET", "")
    auth_header = request.headers.get("Authorization", "")
    if not seed_secret or auth_header != f"Bearer {seed_secret}":
        raise HTTPException(status_code=404, detail="Not found")

    pool = await get_pool()
    count = await pool.fetchval("SELECT COUNT(*) FROM tcpd_ae")
    if count > 0:
        return {"detail": f"Table already has {count} rows. Truncate first.", "rows": count}

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
    # which PostgreSQL COPY protocol auto-casts to column types
    import io as _io
    tsv_buf = _io.BytesIO()
    row_count = 0
    for row in reader:
        # Map CSV headers (any case) to lowercase column names
        lc_row = {k.lower(): v for k, v in row.items()}
        vals = []
        for col in columns:
            v = lc_row.get(col, "")
            vals.append(v if v != "" else "\\N")
        tsv_buf.write(("\t".join(vals) + "\n").encode("utf-8"))
        row_count += 1
    tsv_buf.seek(0)

    try:
        async with pool.acquire() as conn:
            # Drop unique index if exists so COPY doesn't fail on CSV duplicates
            await conn.execute("DROP INDEX IF EXISTS idx_tcpd_unique_entry")
            await conn.copy_to_table(
                "tcpd_ae",
                columns=columns,
                source=tsv_buf,
                format="text",
                schema_name="public",
            )
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": "Seed failed. Check server logs."})

    # Deduplicate
    await pool.execute("""
        DELETE FROM tcpd_ae a USING tcpd_ae b
        WHERE a.id > b.id
          AND a.year = b.year
          AND a.constituency_no = b.constituency_no
          AND a.candidate = b.candidate
          AND a.poll_no IS NOT DISTINCT FROM b.poll_no
    """)
    await pool.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_tcpd_unique_entry
          ON tcpd_ae (year, constituency_no, candidate, COALESCE(poll_no, 0))
    """)
    final_count = await pool.fetchval("SELECT COUNT(*) FROM tcpd_ae")

    return {"detail": "Seeded successfully", "rows_parsed": row_count, "final_count": final_count}


@app.post("/admin/dedup", tags=["infra"])
async def dedup_data(request: Request):
    """Deduplicate tcpd_ae table and create unique index."""
    seed_secret = os.environ.get("SEED_SECRET", "")
    auth_header = request.headers.get("Authorization", "")
    if not seed_secret or auth_header != f"Bearer {seed_secret}":
        raise HTTPException(status_code=404, detail="Not found")

    pool = await get_pool()
    before = await pool.fetchval("SELECT COUNT(*) FROM tcpd_ae")
    await pool.execute("""
        DELETE FROM tcpd_ae a USING tcpd_ae b
        WHERE a.id > b.id
          AND a.year = b.year
          AND a.constituency_no = b.constituency_no
          AND a.candidate = b.candidate
          AND a.poll_no IS NOT DISTINCT FROM b.poll_no
    """)
    await pool.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_tcpd_unique_entry
          ON tcpd_ae (year, constituency_no, candidate, COALESCE(poll_no, 0))
    """)
    after = await pool.fetchval("SELECT COUNT(*) FROM tcpd_ae")
    return {"before": before, "after": after, "removed": before - after}


@app.post("/admin/truncate", tags=["infra"])
async def truncate_data(request: Request):
    """Truncate tcpd_ae table."""
    seed_secret = os.environ.get("SEED_SECRET", "")
    auth_header = request.headers.get("Authorization", "")
    if not seed_secret or auth_header != f"Bearer {seed_secret}":
        raise HTTPException(status_code=404, detail="Not found")

    pool = await get_pool()
    before = await pool.fetchval("SELECT COUNT(*) FROM tcpd_ae")
    await pool.execute("TRUNCATE tcpd_ae RESTART IDENTITY")
    return {"detail": "Truncated", "rows_removed": before}
