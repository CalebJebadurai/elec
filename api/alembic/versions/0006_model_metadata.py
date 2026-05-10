"""add model_metadata table for ML model tracking

Revision ID: 0006_model_metadata
Revises: 0005_materialized_views
Create Date: 2026-04-30
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0006_model_metadata"
down_revision: Union[str, None] = "0005_materialized_views"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS model_metadata (
            id SERIAL PRIMARY KEY,
            model_name TEXT NOT NULL,
            version TEXT NOT NULL,
            state_name TEXT,
            file_path TEXT NOT NULL,
            metrics JSONB DEFAULT '{}',
            training_params JSONB DEFAULT '{}',
            feature_names JSONB DEFAULT '[]',
            is_active BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE(model_name, version, state_name)
        );
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_model_metadata_active
        ON model_metadata(model_name, state_name) WHERE is_active = true;
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_model_metadata_active;")
    op.execute("DROP TABLE IF EXISTS model_metadata;")
