"""add composite indexes for national query optimization

Revision ID: 0004_composite_indexes
Revises: 0003_prediction_scores
Create Date: 2026-04-28
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0004_composite_indexes"
down_revision: Union[str, None] = "0003_prediction_scores"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# CREATE INDEX CONCURRENTLY cannot run inside a transaction
transaction = False


def upgrade() -> None:
    # Drop first for idempotency on retry
    op.execute("DROP INDEX IF EXISTS idx_tcpd_state_pos_et")
    op.execute("DROP INDEX IF EXISTS idx_tcpd_party_state_year")
    op.execute("DROP INDEX IF EXISTS idx_tcpd_candidate_trgm")

    # Composite index for national state summary queries
    # (state_name, position, election_type)
    op.execute(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tcpd_state_pos_et "
        "ON tcpd_ae(state_name, position, election_type)"
    )

    # Composite index for party strength queries
    # (party, state_name, year)
    op.execute(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tcpd_party_state_year "
        "ON tcpd_ae(party, state_name, year)"
    )

    # Trigram GIN index for candidate ILIKE search
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tcpd_candidate_trgm "
        "ON tcpd_ae USING gin(candidate gin_trgm_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_tcpd_state_pos_et")
    op.execute("DROP INDEX IF EXISTS idx_tcpd_party_state_year")
    op.execute("DROP INDEX IF EXISTS idx_tcpd_candidate_trgm")
