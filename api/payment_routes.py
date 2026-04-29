"""Razorpay subscription lifecycle: create, webhook, status, cancel."""

import hashlib
import hmac
import json
import logging
import os
from datetime import datetime, timedelta, timezone

import razorpay
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse

from auth import require_user
from database import get_pool
from models import SubscriptionOut

logger = logging.getLogger("payments")

payment_router = APIRouter(prefix="/subscriptions", tags=["payments"])
webhook_router = APIRouter(prefix="/webhooks", tags=["webhooks"])

# Razorpay client (lazy init)
_rz_client: razorpay.Client | None = None

RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "")
RAZORPAY_WEBHOOK_SECRET = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "")
RAZORPAY_PLAN_ID_PRO = os.environ.get("RAZORPAY_PLAN_ID_PRO", "")
GRACE_PERIOD_DAYS = int(os.environ.get("GRACE_PERIOD_DAYS", "7"))


def _get_rz() -> razorpay.Client:
    global _rz_client
    if _rz_client is None:
        if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Payment service not configured")
        _rz_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
    return _rz_client


# ── Create subscription ─────────────────────────────────────

@payment_router.post("/create")
async def create_subscription(user: dict = Depends(require_user)):
    pool = await get_pool()
    user_id = int(user["sub"])

    # Check for existing active subscription
    existing = await pool.fetchrow(
        "SELECT id FROM subscriptions WHERE user_id = $1 AND status IN ('active', 'in_grace_period')",
        user_id,
    )
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "You already have an active subscription")

    rz = _get_rz()
    rz_sub = rz.subscription.create({
        "plan_id": RAZORPAY_PLAN_ID_PRO,
        "total_count": 12,  # max billing cycles
        "quantity": 1,
    })

    await pool.execute(
        """INSERT INTO subscriptions (user_id, tier, razorpay_subscription_id, status)
           VALUES ($1, 'pro', $2, 'active')""",
        user_id,
        rz_sub["id"],
    )

    return {
        "subscription_id": rz_sub["id"],
        "short_url": rz_sub.get("short_url"),
    }


# ── Get current user's subscription ─────────────────────────

@payment_router.get("/me", response_model=SubscriptionOut | None)
async def my_subscription(user: dict = Depends(require_user)):
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
        int(user["sub"]),
    )
    if not row:
        return None
    return dict(row)


# ── Cancel subscription ─────────────────────────────────────

@payment_router.post("/cancel")
async def cancel_subscription(user: dict = Depends(require_user)):
    pool = await get_pool()
    user_id = int(user["sub"])
    sub = await pool.fetchrow(
        "SELECT id, razorpay_subscription_id FROM subscriptions WHERE user_id = $1 AND status = 'active'",
        user_id,
    )
    if not sub:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No active subscription")

    rz = _get_rz()
    rz.subscription.cancel(sub["razorpay_subscription_id"], {"cancel_at_cycle_end": 1})

    await pool.execute(
        "UPDATE subscriptions SET status = 'canceled', canceled_at = NOW() WHERE id = $1",
        sub["id"],
    )
    return {"status": "canceled", "message": "Subscription will end at the current billing period"}


# ── Razorpay webhook handler ────────────────────────────────

def _verify_signature(body: bytes, signature: str) -> bool:
    if not RAZORPAY_WEBHOOK_SECRET:
        return False
    expected = hmac.new(
        RAZORPAY_WEBHOOK_SECRET.encode(),
        body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


@webhook_router.post("/razorpay")
async def razorpay_webhook(request: Request):
    body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")

    if not _verify_signature(body, signature):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid signature")

    payload = json.loads(body)
    event_id = payload.get("event_id") or payload.get("id", "")
    event_type = payload.get("event", "")

    pool = await get_pool()

    # Idempotency check
    exists = await pool.fetchval(
        "SELECT 1 FROM processed_webhooks WHERE event_id = $1", event_id
    )
    if exists:
        return JSONResponse({"status": "already_processed"})

    try:
        entity = payload.get("payload", {}).get("subscription", {}).get("entity", {})
        rz_sub_id = entity.get("id")

        if not rz_sub_id:
            logger.warning("Webhook %s has no subscription ID", event_id)
            return JSONResponse({"status": "ignored"})

        sub = await pool.fetchrow(
            "SELECT id, user_id FROM subscriptions WHERE razorpay_subscription_id = $1",
            rz_sub_id,
        )
        if not sub:
            logger.warning("Unknown subscription %s in webhook %s", rz_sub_id, event_id)
            return JSONResponse({"status": "unknown_subscription"})

        now = datetime.now(timezone.utc)

        if event_type == "subscription.activated":
            await pool.execute(
                "UPDATE subscriptions SET status = 'active', current_period_start = $2 WHERE id = $1",
                sub["id"], now,
            )
            await pool.execute("UPDATE users SET tier = 'pro' WHERE id = $1", sub["user_id"])

        elif event_type == "subscription.charged":
            period_end_ts = entity.get("current_end")
            period_end = datetime.fromtimestamp(period_end_ts, tz=timezone.utc) if period_end_ts else now + timedelta(days=30)
            await pool.execute(
                "UPDATE subscriptions SET status = 'active', current_period_end = $2, grace_period_end = NULL WHERE id = $1",
                sub["id"], period_end,
            )
            await pool.execute("UPDATE users SET tier = 'pro' WHERE id = $1", sub["user_id"])

        elif event_type == "subscription.cancelled":
            await pool.execute(
                "UPDATE subscriptions SET status = 'canceled', canceled_at = NOW() WHERE id = $1",
                sub["id"],
            )
            # Tier downgrade happens at period end (not immediately)

        elif event_type == "payment.failed":
            grace_end = now + timedelta(days=GRACE_PERIOD_DAYS)
            await pool.execute(
                "UPDATE subscriptions SET status = 'in_grace_period', grace_period_end = $2 WHERE id = $1",
                sub["id"], grace_end,
            )

        elif event_type == "subscription.expired":
            await pool.execute(
                "UPDATE subscriptions SET status = 'expired' WHERE id = $1", sub["id"]
            )
            await pool.execute("UPDATE users SET tier = 'free' WHERE id = $1", sub["user_id"])

    finally:
        # Record processed webhook regardless of outcome
        await pool.execute(
            "INSERT INTO processed_webhooks (event_id, event_type) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            event_id, event_type,
        )

    return JSONResponse({"status": "processed"})
