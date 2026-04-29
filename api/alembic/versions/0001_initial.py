"""initial schema matching init.sql

Revision ID: 0001_initial
Revises: None
Create Date: 2026-04-28
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Election data table ──────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS tcpd_ae (
            id SERIAL PRIMARY KEY,
            state_name TEXT,
            assembly_no INTEGER,
            constituency_no INTEGER NOT NULL,
            year INTEGER NOT NULL,
            month INTEGER,
            delim_id INTEGER,
            poll_no INTEGER,
            position INTEGER,
            candidate TEXT NOT NULL,
            sex TEXT,
            party TEXT,
            votes INTEGER,
            age INTEGER,
            candidate_type TEXT,
            valid_votes INTEGER,
            electors INTEGER,
            constituency_name TEXT NOT NULL,
            constituency_type TEXT,
            district_name TEXT,
            sub_region TEXT,
            n_cand INTEGER,
            turnout_percentage NUMERIC,
            vote_share_percentage NUMERIC,
            deposit_lost TEXT,
            margin INTEGER,
            margin_percentage NUMERIC,
            enop NUMERIC,
            pid TEXT,
            party_type_tcpd TEXT,
            party_id INTEGER,
            last_poll TEXT,
            contested INTEGER,
            last_party TEXT,
            last_party_id TEXT,
            last_constituency_name TEXT,
            same_constituency TEXT,
            same_party TEXT,
            no_terms INTEGER,
            turncoat TEXT,
            incumbent TEXT,
            recontest TEXT,
            myneta_education TEXT,
            tcpd_prof_main TEXT,
            tcpd_prof_main_desc TEXT,
            tcpd_prof_second TEXT,
            tcpd_prof_second_desc TEXT,
            election_type TEXT
        )
    """)

    # ── Performance indexes ──────────────────────────────
    op.execute("CREATE INDEX IF NOT EXISTS idx_tcpd_year ON tcpd_ae(year)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_tcpd_party ON tcpd_ae(party)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_tcpd_constituency ON tcpd_ae(constituency_name)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_tcpd_district ON tcpd_ae(district_name)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_tcpd_position ON tcpd_ae(position)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_tcpd_year_position ON tcpd_ae(year, position)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_tcpd_year_constituency ON tcpd_ae(year, constituency_no)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_tcpd_state_year ON tcpd_ae(state_name, year)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_tcpd_state_const_year ON tcpd_ae(state_name, constituency_name, year)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_tcpd_state_year_pos ON tcpd_ae(state_name, year, position)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_tcpd_election_type ON tcpd_ae(election_type)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_tcpd_state_election_type ON tcpd_ae(state_name, election_type)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_tcpd_state_poll ON tcpd_ae(state_name, poll_no)")

    # Trigram extension and index (best-effort)
    op.execute("""
        DO $$ BEGIN
            CREATE EXTENSION IF NOT EXISTS pg_trgm;
        EXCEPTION WHEN OTHERS THEN NULL;
        END $$
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE INDEX IF NOT EXISTS idx_tcpd_candidate_trgm ON tcpd_ae USING gin (candidate gin_trgm_ops);
        EXCEPTION WHEN OTHERS THEN
            CREATE INDEX IF NOT EXISTS idx_tcpd_candidate ON tcpd_ae(candidate);
        END $$
    """)

    # ── Users table ──────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            mobile TEXT UNIQUE NOT NULL,
            display_name TEXT NOT NULL DEFAULT 'Analyst',
            google_id TEXT UNIQUE,
            google_email TEXT,
            avatar_url TEXT,
            date_of_birth DATE,
            role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_users_mobile ON users(mobile)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_users_google ON users(google_id)")

    # ── Bookmarks table ──────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS bookmarks (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            params JSONB NOT NULL,
            is_public BOOLEAN NOT NULL DEFAULT false,
            like_count INTEGER NOT NULL DEFAULT 0,
            dislike_count INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_bookmarks_public ON bookmarks(is_public) WHERE is_public = true")
    op.execute("CREATE INDEX IF NOT EXISTS idx_bookmarks_created ON bookmarks(created_at DESC)")

    # ── Votes table ──────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS votes (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            bookmark_id INTEGER NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
            vote_type TEXT NOT NULL CHECK (vote_type IN ('like', 'dislike')),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE(user_id, bookmark_id)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_votes_bookmark ON votes(bookmark_id)")

    # ── Unique constraint to prevent duplicates ──────────
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_tcpd_unique_entry
            ON tcpd_ae (state_name, year, constituency_no, candidate, COALESCE(poll_no, 0), COALESCE(election_type, ''))
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS votes CASCADE")
    op.execute("DROP TABLE IF EXISTS bookmarks CASCADE")
    op.execute("DROP TABLE IF EXISTS users CASCADE")
    op.execute("DROP TABLE IF EXISTS tcpd_ae CASCADE")
