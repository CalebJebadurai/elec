"""add subscription tiers, api_keys, processed_webhooks, usage_summary

Revision ID: 0002_subscriptions
Revises: 0001_initial
Create Date: 2026-04-28
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0002_subscriptions"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add tier column to users
    op.execute("""
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'free'
        CHECK (tier IN ('free', 'pro', 'business', 'enterprise'))
    """)

    # Subscriptions table
    op.execute("""
        CREATE TABLE IF NOT EXISTS subscriptions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            tier TEXT NOT NULL DEFAULT 'pro',
            razorpay_customer_id TEXT,
            razorpay_subscription_id TEXT,
            status TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'canceled', 'past_due', 'in_grace_period', 'expired')),
            current_period_start TIMESTAMPTZ,
            current_period_end TIMESTAMPTZ,
            grace_period_end TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            canceled_at TIMESTAMPTZ
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id)")

    # API keys table
    op.execute("""
        CREATE TABLE IF NOT EXISTS api_keys (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            key_hash TEXT NOT NULL,
            key_prefix TEXT NOT NULL,
            label TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_used_at TIMESTAMPTZ,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            revoked_at TIMESTAMPTZ
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix)")

    # Idempotent webhook tracking
    op.execute("""
        CREATE TABLE IF NOT EXISTS processed_webhooks (
            id SERIAL PRIMARY KEY,
            event_id TEXT UNIQUE NOT NULL,
            event_type TEXT,
            processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_processed_webhooks_event ON processed_webhooks(event_id)")

    # Usage metering
    op.execute("""
        CREATE TABLE IF NOT EXISTS usage_summary (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            api_key_id INTEGER REFERENCES api_keys(id) ON DELETE SET NULL,
            date DATE NOT NULL DEFAULT CURRENT_DATE,
            endpoint_group TEXT,
            request_count INTEGER NOT NULL DEFAULT 0,
            total_response_time_ms INTEGER NOT NULL DEFAULT 0
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_usage_summary_user_date ON usage_summary(user_id, date)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS usage_summary")
    op.execute("DROP TABLE IF EXISTS processed_webhooks")
    op.execute("DROP TABLE IF EXISTS api_keys")
    op.execute("DROP TABLE IF EXISTS subscriptions")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS tier")
