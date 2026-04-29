"""Admin-only endpoints for subscription management and oversight."""

import asyncio
import logging
import os
import time

import razorpay
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from auth import require_user
from cache import get_cached, set_cached, invalidate, _get_redis
from database import get_pool
from ingest import ingest_csv

logger = logging.getLogger("admin")

admin_router = APIRouter(prefix="/admin", tags=["admin"])


async def _require_admin(user: dict = Depends(require_user)) -> dict:
    if user.get("role") != "admin":
        # Return 404 to avoid revealing endpoint existence
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    return user


@admin_router.get("/subscriptions")
async def list_subscriptions(user: dict = Depends(_require_admin)):
    pool = await get_pool()
    rows = await pool.fetch(
        """SELECT s.*, u.mobile, u.display_name
           FROM subscriptions s JOIN users u ON s.user_id = u.id
           ORDER BY s.created_at DESC LIMIT 200"""
    )
    return [dict(r) for r in rows]


@admin_router.put("/subscriptions/{user_id}/tier")
async def set_user_tier(user_id: int, tier: str, admin: dict = Depends(_require_admin)):
    if tier not in ("free", "pro", "enterprise"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid tier")
    pool = await get_pool()
    result = await pool.execute("UPDATE users SET tier = $2 WHERE id = $1", user_id, tier)
    if result == "UPDATE 0":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return {"user_id": user_id, "tier": tier}


@admin_router.post("/subscriptions/{subscription_id}/refund")
async def refund_subscription(subscription_id: int, admin: dict = Depends(_require_admin)):
    pool = await get_pool()
    sub = await pool.fetchrow("SELECT * FROM subscriptions WHERE id = $1", subscription_id)
    if not sub:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Subscription not found")

    rz_key = os.environ.get("RAZORPAY_KEY_ID", "")
    rz_secret = os.environ.get("RAZORPAY_KEY_SECRET", "")
    if not rz_key or not rz_secret:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Payment service not configured")

    rz = razorpay.Client(auth=(rz_key, rz_secret))
    # Fetch the latest payment for this subscription
    payments = rz.subscription.fetch(sub["razorpay_subscription_id"]).get("payments", {})
    if not payments:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No payments found for refund")

    # Refund the most recent payment
    latest_payment_id = payments[0].get("id") if isinstance(payments, list) and payments else None
    if not latest_payment_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Could not determine payment to refund")

    refund = rz.payment.refund(latest_payment_id, {})
    await pool.execute(
        "UPDATE subscriptions SET status = 'expired' WHERE id = $1", subscription_id
    )
    await pool.execute(
        "UPDATE users SET tier = 'free' WHERE id = $1", sub["user_id"]
    )
    logger.info("Admin %s refunded subscription %s (user %s)", admin["sub"], subscription_id, sub["user_id"])
    return {"refund_id": refund.get("id"), "status": "refunded"}


@admin_router.post("/ingest")
async def admin_ingest(request: Request, admin: dict = Depends(_require_admin)):
    """Ingest CSV election data with validation and upsert."""
    body = await request.body()
    csv_text = body.decode("utf-8")
    pool = await get_pool()
    result = await ingest_csv(pool, csv_text)
    logger.info("Admin %s ingested data: %s", admin["sub"], result.summary())
    return result.summary()


# ── Cache busting ─────────────────────────────────────────────────────────
_last_cache_clear = 0.0
_CACHE_CLEAR_COOLDOWN = 60  # 1 minute rate limit


@admin_router.post("/cache/clear")
async def clear_cache(
    prefix: str | None = Query(None),
    admin: dict = Depends(_require_admin),
):
    """Invalidate caches with staggered groups to prevent thundering herd."""
    global _last_cache_clear
    now = time.time()
    if now - _last_cache_clear < _CACHE_CLEAR_COOLDOWN:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Cache clear rate limited — wait 1 minute between clears",
        )
    _last_cache_clear = now

    cleared = 0
    r = await _get_redis()

    # Define cache key groups for staggered invalidation
    groups = [
        ["states_list"],
        ["stats_summary:*"],
        ["constituencies:*", "districts:*", "years:*", "parties:*"],
        ["national_state_summary:*", "national_party_strength:*",
         "national_turnout_trends:*", "national_upcoming",
         "national_compare:*", "national_party_map:*"],
        ["swings_state:*", "swings_constituencies:*", "predict_data:*"],
    ]

    for group in groups:
        for pattern in group:
            if prefix and not pattern.startswith(prefix):
                continue
            if r:
                try:
                    if "*" in pattern:
                        async for key in r.scan_iter(match=pattern):
                            await r.delete(key)
                            cleared += 1
                    else:
                        deleted = await r.delete(pattern)
                        cleared += deleted
                except Exception:
                    logger.warning("Failed to clear cache pattern: %s", pattern)
        # Stagger between groups to avoid thundering herd
        if group != groups[-1]:
            await asyncio.sleep(1)

    logger.info("Admin %s cleared %d cache entries (prefix=%s)", admin["sub"], cleared, prefix)

    # Also refresh materialized views if clearing national data
    if not prefix or prefix.startswith("national"):
        try:
            from national_routes import refresh_materialized_views
            await refresh_materialized_views()
        except Exception as e:
            logger.warning("Failed to refresh materialized views: %s", e)

    return {"cleared": cleared}
