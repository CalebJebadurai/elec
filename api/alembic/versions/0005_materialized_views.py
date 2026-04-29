"""add materialized views for national aggregation endpoints

Revision ID: 0005_materialized_views
Revises: 0004_composite_indexes
Create Date: 2026-04-28
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0005_materialized_views"
down_revision: Union[str, None] = "0004_composite_indexes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -- State Summary materialized view --
    op.execute("""
        CREATE MATERIALIZED VIEW IF NOT EXISTS mv_national_state_summary AS
        WITH latest AS (
            SELECT state_name, election_type, MAX(year) AS latest_year
            FROM tcpd_ae
            WHERE (poll_no = 0 OR poll_no IS NULL)
              AND state_name IS NOT NULL
            GROUP BY state_name, election_type
        ),
        filtered AS (
            SELECT t.*
            FROM tcpd_ae t
            JOIN latest l ON t.state_name = l.state_name
                         AND t.year = l.latest_year
                         AND t.election_type = l.election_type
            WHERE (t.poll_no = 0 OR t.poll_no IS NULL)
        ),
        winners AS (
            SELECT state_name, election_type, party, COUNT(*) AS seats_won
            FROM filtered WHERE position = 1
            GROUP BY state_name, election_type, party
        ),
        ranked AS (
            SELECT state_name, election_type, party, seats_won,
                   ROW_NUMBER() OVER (
                       PARTITION BY state_name, election_type
                       ORDER BY seats_won DESC
                   ) AS rn
            FROM winners
        ),
        turnout AS (
            SELECT state_name, election_type,
                   AVG(turnout_percentage) AS avg_turnout,
                   COUNT(DISTINCT constituency_name) AS total_const
            FROM filtered WHERE position = 1
            GROUP BY state_name, election_type
        ),
        electors AS (
            SELECT state_name, election_type, SUM(max_e) AS total_electors
            FROM (
                SELECT state_name, election_type, constituency_no,
                       MAX(electors) AS max_e
                FROM filtered
                GROUP BY state_name, election_type, constituency_no
            ) sub
            GROUP BY state_name, election_type
        )
        SELECT l.state_name, l.election_type, l.latest_year,
               tu.total_const,
               tu.avg_turnout,
               el.total_electors,
               r1.party AS ruling_party, r1.seats_won AS ruling_seats,
               r2.party AS runner_up_party, r2.seats_won AS runner_up_seats
        FROM latest l
        LEFT JOIN ranked r1 ON l.state_name = r1.state_name
                           AND l.election_type = r1.election_type AND r1.rn = 1
        LEFT JOIN ranked r2 ON l.state_name = r2.state_name
                           AND l.election_type = r2.election_type AND r2.rn = 2
        LEFT JOIN turnout tu ON l.state_name = tu.state_name
                            AND l.election_type = tu.election_type
        LEFT JOIN electors el ON l.state_name = el.state_name
                             AND l.election_type = el.election_type
        ORDER BY l.state_name
    """)
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_state_summary_pk
        ON mv_national_state_summary(state_name, election_type)
    """)

    # -- Party Strength materialized view --
    op.execute("""
        CREATE MATERIALIZED VIEW IF NOT EXISTS mv_national_party_strength AS
        SELECT
            CASE
                WHEN party IN ('INC(I)', 'INC (I)') THEN 'INC'
                WHEN party IN ('ADK', 'AIADMK', 'ADK(JL)') THEN 'ADMK'
                WHEN party IN ('BHP', 'B.J.P', 'B.J.P.') THEN 'BJP'
                WHEN party IN ('S.P', 'S.P.') THEN 'SP'
                WHEN party IN ('JD(S)', 'JD (S)') THEN 'JDS'
                WHEN party IN ('JD(U)', 'JD (U)') THEN 'JDU'
                WHEN party IN ('B.S.P.', 'B.S.P', 'BSP(K)', 'BSP (K)') THEN 'BSP'
                WHEN party IN ('SHS', 'ShivSena', 'SHIV SENA') THEN 'SS'
                WHEN party = 'TRS' THEN 'BRS'
                ELSE COALESCE(NULLIF(TRIM(party), ''), 'IND')
            END AS normalized_party,
            election_type,
            COUNT(DISTINCT state_name) AS states_won_in,
            COUNT(*) AS total_seats_won,
            AVG(vote_share_percentage) AS avg_vote_share,
            ARRAY_AGG(DISTINCT year ORDER BY year) AS years_active
        FROM tcpd_ae
        WHERE position = 1
          AND (poll_no = 0 OR poll_no IS NULL)
          AND party IS NOT NULL
          AND state_name NOT IN ('Mysore', 'Madras', 'Goa_Daman_&_Diu', 'Goa,_Daman_&_Diu')
        GROUP BY normalized_party, election_type
        ORDER BY total_seats_won DESC
    """)
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_party_strength_pk
        ON mv_national_party_strength(normalized_party, election_type)
    """)

    # -- Turnout Trends materialized view --
    op.execute("""
        CREATE MATERIALIZED VIEW IF NOT EXISTS mv_national_turnout_trends AS
        WITH per_constituency AS (
            SELECT year, election_type, state_name, constituency_no,
                   MAX(electors) AS max_electors,
                   MAX(CASE WHEN position = 1 THEN turnout_percentage END) AS turnout_pct
            FROM tcpd_ae
            WHERE (poll_no = 0 OR poll_no IS NULL)
              AND state_name NOT IN ('Mysore', 'Madras', 'Goa_Daman_&_Diu', 'Goa,_Daman_&_Diu')
            GROUP BY year, election_type, state_name, constituency_no
        )
        SELECT year, election_type,
               AVG(turnout_pct) AS avg_turnout,
               SUM(max_electors) AS total_electors,
               COUNT(DISTINCT state_name) AS states_counted
        FROM per_constituency
        WHERE turnout_pct IS NOT NULL
        GROUP BY year, election_type
        ORDER BY year
    """)
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_turnout_trends_pk
        ON mv_national_turnout_trends(year, election_type)
    """)

    # Initial data population
    op.execute("REFRESH MATERIALIZED VIEW mv_national_state_summary")
    op.execute("REFRESH MATERIALIZED VIEW mv_national_party_strength")
    op.execute("REFRESH MATERIALIZED VIEW mv_national_turnout_trends")


def downgrade() -> None:
    op.execute("DROP MATERIALIZED VIEW IF EXISTS mv_national_turnout_trends")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS mv_national_party_strength")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS mv_national_state_summary")
