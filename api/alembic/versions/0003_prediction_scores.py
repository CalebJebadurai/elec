"""add prediction_scores table for accuracy tracking

Revision ID: 0003_prediction_scores
Revises: 0002_subscriptions
Create Date: 2026-04-28
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0003_prediction_scores"
down_revision: Union[str, None] = "0002_subscriptions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS prediction_scores (
            id SERIAL PRIMARY KEY,
            bookmark_id INTEGER NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            state_name TEXT NOT NULL,
            year INTEGER NOT NULL,
            election_type TEXT NOT NULL DEFAULT 'AE',
            seats_correct INTEGER NOT NULL DEFAULT 0,
            total_seats INTEGER NOT NULL DEFAULT 0,
            accuracy_pct NUMERIC,
            mean_abs_error NUMERIC,
            scored_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_prediction_scores_user ON prediction_scores(user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_prediction_scores_bookmark ON prediction_scores(bookmark_id)")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_prediction_scores_unique ON prediction_scores(bookmark_id, state_name, year)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS prediction_scores")
