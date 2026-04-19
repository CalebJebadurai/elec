import os
import ssl
import asyncpg

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://elec:elec@localhost:5434/elec"
)

pool: asyncpg.Pool | None = None


def _get_ssl_context():
    """Return an SSL context for remote databases, None for localhost."""
    url = DATABASE_URL.lower()
    if "localhost" in url or "127.0.0.1" in url or "host.docker" in url:
        return None
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE  # Railway/managed DBs use self-signed certs
    return ctx


async def get_pool() -> asyncpg.Pool:
    global pool
    if pool is None:
        ssl_ctx = _get_ssl_context()
        pool = await asyncpg.create_pool(
            dsn=DATABASE_URL,
            min_size=2,
            max_size=10,
            command_timeout=30,
            ssl=ssl_ctx,
        )
    return pool


async def close_pool() -> None:
    global pool
    if pool is not None:
        await pool.close()
        pool = None
