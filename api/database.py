import os
import ssl
import asyncpg

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://elec:elec@localhost:5434/elec"
)

pool: asyncpg.Pool | None = None

# Pool sizing — configurable via environment
DB_POOL_MIN_SIZE = int(os.environ.get("DB_POOL_MIN_SIZE", "2"))
DB_POOL_MAX_SIZE = int(os.environ.get("DB_POOL_MAX_SIZE", "10"))


def _get_ssl_context():
    """Return an SSL context for remote databases, None for localhost."""
    url = DATABASE_URL.lower()
    if "localhost" in url or "127.0.0.1" in url or "host.docker" in url or "@db:" in url or "/cloudsql/" in url:
        return None

    # Railway uses self-signed certs — auto-detect and skip verification
    is_railway = "railway" in url or os.environ.get("RAILWAY_ENVIRONMENT")

    # Emergency toggle: set DB_SSL_VERIFY=false to disable verification
    skip_verify = os.environ.get("DB_SSL_VERIFY", "true").lower() in ("false", "0", "no")

    if skip_verify or is_railway:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        return ctx

    ctx = ssl.create_default_context()
    # Load custom CA certificate if provided
    ca_cert = os.environ.get("DB_SSL_CA_CERT")
    if ca_cert:
        ctx.load_verify_locations(cafile=ca_cert)
    return ctx


async def get_pool() -> asyncpg.Pool:
    global pool
    if pool is None:
        ssl_ctx = _get_ssl_context()
        pool = await asyncpg.create_pool(
            dsn=DATABASE_URL,
            min_size=DB_POOL_MIN_SIZE,
            max_size=DB_POOL_MAX_SIZE,
            command_timeout=30,
            ssl=ssl_ctx,
        )
    return pool


async def close_pool() -> None:
    global pool
    if pool is not None:
        await pool.close()
        pool = None
