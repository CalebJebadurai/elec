CREATE TABLE tcpd_ae (
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
    votes INTEGER NOT NULL,
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
);

-- Performance indexes for election data
CREATE INDEX idx_tcpd_year ON tcpd_ae(year);
CREATE INDEX idx_tcpd_party ON tcpd_ae(party);
CREATE INDEX idx_tcpd_constituency ON tcpd_ae(constituency_name);
CREATE INDEX idx_tcpd_district ON tcpd_ae(district_name);
CREATE INDEX idx_tcpd_position ON tcpd_ae(position);
CREATE INDEX idx_tcpd_year_position ON tcpd_ae(year, position);
CREATE INDEX idx_tcpd_year_constituency ON tcpd_ae(year, constituency_no);

-- Enable trigram extension for fuzzy candidate search (ignore error if not available)
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Trigram index (only works if pg_trgm loaded above)
DO $$ BEGIN
  CREATE INDEX idx_tcpd_candidate_trgm ON tcpd_ae USING gin (candidate gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
  CREATE INDEX idx_tcpd_candidate ON tcpd_ae(candidate);
END $$;

COPY tcpd_ae (
    state_name, assembly_no, constituency_no, year, month, delim_id, poll_no,
    position, candidate, sex, party, votes, age, candidate_type, valid_votes,
    electors, constituency_name, constituency_type, district_name, sub_region,
    n_cand, turnout_percentage, vote_share_percentage, deposit_lost, margin,
    margin_percentage, enop, pid, party_type_tcpd, party_id, last_poll,
    contested, last_party, last_party_id, last_constituency_name,
    same_constituency, same_party, no_terms, turncoat, incumbent, recontest,
    myneta_education, tcpd_prof_main, tcpd_prof_main_desc, tcpd_prof_second,
    tcpd_prof_second_desc, election_type
)
FROM '/data/tcpd_ae.csv'
WITH (FORMAT csv, HEADER true, NULL '');

-- ══════════════════════════════════════════════════════════
-- User & Social Features
-- ══════════════════════════════════════════════════════════

-- Users: sign up with mobile, optionally link Google
CREATE TABLE users (
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
);
CREATE INDEX idx_users_mobile ON users(mobile);
CREATE INDEX idx_users_google ON users(google_id);

-- Bookmarks: saved prediction parameter sets
CREATE TABLE bookmarks (
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
);
CREATE INDEX idx_bookmarks_user ON bookmarks(user_id);
CREATE INDEX idx_bookmarks_public ON bookmarks(is_public) WHERE is_public = true;
CREATE INDEX idx_bookmarks_created ON bookmarks(created_at DESC);

-- Votes: likes/dislikes on public bookmarks (one vote per user per bookmark)
CREATE TABLE votes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bookmark_id INTEGER NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
    vote_type TEXT NOT NULL CHECK (vote_type IN ('like', 'dislike')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, bookmark_id)
);
CREATE INDEX idx_votes_bookmark ON votes(bookmark_id);

-- ══════════════════════════════════════════════════════════
-- Deduplicate: keep the row with the lowest id for each duplicate
-- ══════════════════════════════════════════════════════════
DELETE FROM tcpd_ae a USING tcpd_ae b
WHERE a.id > b.id
  AND a.year = b.year
  AND a.constituency_no = b.constituency_no
  AND a.candidate = b.candidate
  AND a.poll_no IS NOT DISTINCT FROM b.poll_no;

-- Prevent future duplicates
CREATE UNIQUE INDEX idx_tcpd_unique_entry
  ON tcpd_ae (year, constituency_no, candidate, COALESCE(poll_no, 0));

-- ══════════════════════════════════════════════════════════
-- Restricted application user (least-privilege)
-- ══════════════════════════════════════════════════════════
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'elec_app') THEN
    CREATE ROLE elec_app WITH LOGIN PASSWORD 'change_me_app_password';
  END IF;
END $$;

GRANT CONNECT ON DATABASE elec TO elec_app;
GRANT USAGE ON SCHEMA public TO elec_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO elec_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO elec_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO elec_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO elec_app;
