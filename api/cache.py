"""Redis-backed cache for API responses. Falls back to in-memory dict if Redis unavailable."""

import json
import logging
import os

logger = logging.getLogger("cache")

REDIS_URL = os.environ.get("REDIS_URL", "")

_redis = None
_fallback: dict[str, tuple[float, str]] = {}


async def _get_redis():
    global _redis
    if _redis is not None:
        return _redis
    if not REDIS_URL:
        return None
    try:
        import redis.asyncio as aioredis
        _redis = aioredis.from_url(REDIS_URL, decode_responses=True)
        await _redis.ping()
        logger.info("Redis connected: %s", REDIS_URL.split("@")[-1] if "@" in REDIS_URL else "local")
        return _redis
    except Exception as e:
        logger.warning("Redis unavailable, using in-memory fallback: %s", e)
        _redis = None
        return None


async def get_cached(key: str) -> dict | list | None:
    """Get a cached value by key. Returns None on miss."""
    r = await _get_redis()
    if r:
        try:
            val = await r.get(key)
            return json.loads(val) if val else None
        except Exception:
            return None
    # Fallback
    import time
    entry = _fallback.get(key)
    if entry and time.time() < entry[0]:
        return json.loads(entry[1])
    return None


async def set_cached(key: str, data, ttl: int = 300):
    """Cache a value with TTL (seconds)."""
    serialized = json.dumps(data, default=str)
    r = await _get_redis()
    if r:
        try:
            await r.setex(key, ttl, serialized)
            return
        except Exception:
            pass
    # Fallback
    import time
    _fallback[key] = (time.time() + ttl, serialized)
    # Evict stale entries if too many
    if len(_fallback) > 5000:
        now = time.time()
        stale = [k for k, (exp, _) in _fallback.items() if now > exp]
        for k in stale:
            del _fallback[k]


async def invalidate(key: str):
    r = await _get_redis()
    if r:
        try:
            await r.delete(key)
            return
        except Exception:
            pass
    _fallback.pop(key, None)


async def close_redis():
    global _redis
    if _redis:
        await _redis.close()
        _redis = None


async def get_cached_with_lock(key: str, ttl: int, fetch_fn):
    """Cache-aside with distributed lock to prevent stampede.

    On cache miss, only one caller acquires the lock and calls fetch_fn;
    others poll briefly for the result. Falls back to direct fetch when
    Redis is unavailable or the lock wait times out.
    """
    # Fast path: cache hit
    cached = await get_cached(key)
    if cached is not None:
        return cached

    lock_key = f"lock:{key}"
    r = await _get_redis()

    # No Redis — skip locking, fetch directly
    if not r:
        data = await fetch_fn()
        await set_cached(key, data, ttl=ttl)
        return data

    # Try to acquire lock (30s TTL)
    try:
        acquired = await r.set(lock_key, "1", nx=True, ex=30)
    except Exception:
        acquired = False

    if acquired:
        try:
            data = await fetch_fn()
            await set_cached(key, data, ttl=ttl)
            return data
        finally:
            try:
                await r.delete(lock_key)
            except Exception:
                pass
    else:
        # Another request holds the lock — poll for result
        import asyncio
        for _ in range(10):  # 10 × 50ms = 500ms max wait
            await asyncio.sleep(0.05)
            cached = await get_cached(key)
            if cached is not None:
                return cached
        # Timed out waiting — fall through and fetch ourselves
        data = await fetch_fn()
        await set_cached(key, data, ttl=ttl)
        return data
