import os
import asyncpg

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://elec:elec@localhost:5434/elec"
)

pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global pool
    if pool is None:
        # Cloud SQL uses Unix sockets: ?host=/cloudsql/project:region:instance
        # asyncpg needs dsn= for URLs with query params
        pool = await asyncpg.create_pool(
            dsn=DATABASE_URL,
            min_size=2,
            max_size=10,
            command_timeout=30,
        )
    return pool


async def close_pool() -> None:
    global pool
    if pool is not None:
        await pool.close()
        pool = None
