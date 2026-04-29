"""National (cross-state) aggregation endpoints for the election dashboard."""

import logging
import math
from datetime import datetime

from fastapi import APIRouter, Depends, Query

from auth import get_current_user, require_user
from cache import get_cached, set_cached, get_cached_with_lock
from database import get_pool
from models import (
    NationalPartyStrength,
    NationalStateSummary,
    NationalTurnoutTrend,
    PartyMapEntry,
    UpcomingElection,
)
from routes import _et_filter, _normalize_party

logger = logging.getLogger("national")

router = APIRouter(prefix="/national", tags=["National"])

_NATIONAL_CACHE_TTL = 3600


_EXCLUDED_STATES = {"Mysore", "Madras", "Goa_Daman_&_Diu", "Goa,_Daman_&_Diu"}


def _safe_float(val, decimals=2):
    """Convert a DB value to a rounded float, returning None for NULL/NaN/Inf."""
    if val is None:
        return None
    f = float(val)
    if math.isnan(f) or math.isinf(f):
        return None
    return round(f, decimals)


def _et_display(election_type: str) -> str:
    if election_type.upper() == "GE":
        return "Lok Sabha Election (GE)"
    return "State Assembly Election (AE)"


# ---------------------------------------------------------------------------
# GET /national/state-summary
# ---------------------------------------------------------------------------
@router.get("/state-summary", response_model=list[NationalStateSummary])
async def national_state_summary(
    election_type: str = Query("AE"),
    _user: dict | None = Depends(get_current_user),
):
    cache_key = f"national_state_summary:{election_type}"

    async def _fetch_state_summary():
        pool = await get_pool()
        et_display = _et_display(election_type)

        # Try materialized view first
        try:
            mv_rows = await pool.fetch(
                "SELECT * FROM mv_national_state_summary WHERE election_type = $1 ORDER BY state_name",
                et_display,
            )
            if mv_rows:
                result = []
                for r in mv_rows:
                    sn = r["state_name"]
                    if sn in _EXCLUDED_STATES:
                        continue
                    result.append(NationalStateSummary(
                        state_name=sn,
                        display_name=sn.replace("_", " "),
                        latest_year=r["latest_year"],
                        total_constituencies=r["total_const"] or 0,
                        ruling_party=_normalize_party(r["ruling_party"]),
                        ruling_party_seats=r["ruling_seats"] or 0,
                        runner_up_party=_normalize_party(r["runner_up_party"]),
                        runner_up_seats=r["runner_up_seats"] or 0,
                        avg_turnout=_safe_float(r["avg_turnout"], 1),
                        total_electors=r["total_electors"],
                    ))
                return [item.model_dump() for item in result]
        except Exception:
            logger.debug("mv_national_state_summary not available, using CTE query")

        et_sql = _et_filter(election_type)

        rows = await pool.fetch(f"""
        WITH latest AS (
            SELECT state_name, MAX(year) AS latest_year
            FROM tcpd_ae
            WHERE {et_sql}
              AND (poll_no = 0 OR poll_no IS NULL)
              AND state_name IS NOT NULL
            GROUP BY state_name
        ),
        filtered AS (
            SELECT t.*
            FROM tcpd_ae t
            JOIN latest l ON t.state_name = l.state_name AND t.year = l.latest_year
            WHERE {et_sql} AND (t.poll_no = 0 OR t.poll_no IS NULL)
        ),
        winners AS (
            SELECT state_name, party, COUNT(*) AS seats_won
            FROM filtered
            WHERE position = 1
            GROUP BY state_name, party
        ),
        ranked AS (
            SELECT state_name, party, seats_won,
                   ROW_NUMBER() OVER (PARTITION BY state_name ORDER BY seats_won DESC) AS rn
            FROM winners
        ),
        turnout AS (
            SELECT state_name,
                   AVG(turnout_percentage) AS avg_turnout,
                   COUNT(DISTINCT constituency_name) AS total_const
            FROM filtered
            WHERE position = 1
            GROUP BY state_name
        ),
        electors AS (
            SELECT state_name, SUM(max_e) AS total_electors
            FROM (
                SELECT state_name, constituency_no, MAX(electors) AS max_e
                FROM filtered
                GROUP BY state_name, constituency_no
            ) sub
            GROUP BY state_name
        )
        SELECT l.state_name, l.latest_year,
               tu.total_const,
               tu.avg_turnout,
               el.total_electors,
               r1.party AS ruling_party, r1.seats_won AS ruling_seats,
               r2.party AS runner_up_party, r2.seats_won AS runner_up_seats
        FROM latest l
        LEFT JOIN ranked r1 ON l.state_name = r1.state_name AND r1.rn = 1
        LEFT JOIN ranked r2 ON l.state_name = r2.state_name AND r2.rn = 2
        LEFT JOIN turnout tu ON l.state_name = tu.state_name
        LEFT JOIN electors el ON l.state_name = el.state_name
        ORDER BY l.state_name
        """)

        result = []
        for r in rows:
            sn = r["state_name"]
            if sn in _EXCLUDED_STATES:
                continue
            result.append(NationalStateSummary(
                state_name=sn,
                display_name=sn.replace("_", " "),
                latest_year=r["latest_year"],
                total_constituencies=r["total_const"] or 0,
                ruling_party=_normalize_party(r["ruling_party"]),
                ruling_party_seats=r["ruling_seats"] or 0,
                runner_up_party=_normalize_party(r["runner_up_party"]),
                runner_up_seats=r["runner_up_seats"] or 0,
                avg_turnout=_safe_float(r["avg_turnout"], 1),
                total_electors=r["total_electors"],
            ))
        return [item.model_dump() for item in result]

    return await get_cached_with_lock(cache_key, _NATIONAL_CACHE_TTL, _fetch_state_summary)


# ---------------------------------------------------------------------------
# GET /national/party-strength
# ---------------------------------------------------------------------------
@router.get("/party-strength", response_model=list[NationalPartyStrength])
async def national_party_strength(
    election_type: str = Query("AE"),
    year_min: int | None = None,
    year_max: int | None = None,
    _user: dict | None = Depends(get_current_user),
):
    cache_key = f"national_party_strength:{election_type}:{year_min}:{year_max}"

    async def _fetch_party_strength():
        pool = await get_pool()
        et_display = _et_display(election_type)

        # Try materialized view (only when no year filters — view has all years aggregated)
        if year_min is None and year_max is None:
            try:
                mv_rows = await pool.fetch(
                    "SELECT * FROM mv_national_party_strength WHERE election_type = $1 ORDER BY total_seats_won DESC LIMIT 30",
                    et_display,
                )
                if mv_rows:
                    result = [
                        NationalPartyStrength(
                            party=r["normalized_party"],
                            states_won_in=r["states_won_in"],
                            total_seats_won=r["total_seats_won"],
                            avg_vote_share=_safe_float(r["avg_vote_share"], 2) or 0.0,
                            years_active=r["years_active"] or [],
                        )
                        for r in mv_rows
                    ]
                    return [item.model_dump() for item in result]
            except Exception:
                logger.debug("mv_national_party_strength not available, using CTE query")

        et_sql = _et_filter(election_type)

        year_clause = ""
        params: list = []
        idx = 1
        if year_min is not None:
            year_clause += f" AND year >= ${idx}"
            params.append(year_min)
            idx += 1
        if year_max is not None:
            year_clause += f" AND year <= ${idx}"
            params.append(year_max)
            idx += 1

        # Single query with SQL-side party normalization
        # NOTE: _PARTY_ALIASES in routes.py must stay in sync with this CASE
        rows = await pool.fetch(f"""
            SELECT normalized_party,
                   COUNT(DISTINCT state_name) AS states_won_in,
                   COUNT(*) AS total_seats_won,
                   SUM(vote_share_percentage * 1.0) / NULLIF(COUNT(vote_share_percentage), 0) AS avg_vote_share,
                   ARRAY_AGG(DISTINCT year ORDER BY year) AS years_active
            FROM (
                SELECT *,
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
                    END AS normalized_party
                FROM tcpd_ae
                WHERE position = 1
                  AND {et_sql}
                  AND (poll_no = 0 OR poll_no IS NULL)
                  AND party IS NOT NULL
                  AND state_name NOT IN ('Mysore', 'Madras', 'Goa_Daman_&_Diu', 'Goa,_Daman_&_Diu')
                  {year_clause}
            ) sub
            GROUP BY normalized_party
            ORDER BY total_seats_won DESC
            LIMIT 30
        """, *params)

        result = [
            NationalPartyStrength(
                party=r["normalized_party"],
                states_won_in=r["states_won_in"],
                total_seats_won=r["total_seats_won"],
                avg_vote_share=_safe_float(r["avg_vote_share"], 2) or 0.0,
                years_active=r["years_active"] or [],
            )
            for r in rows
        ]
        return [item.model_dump() for item in result]

    return await get_cached_with_lock(cache_key, _NATIONAL_CACHE_TTL, _fetch_party_strength)


# ---------------------------------------------------------------------------
# GET /national/turnout-trends
# ---------------------------------------------------------------------------
@router.get("/turnout-trends", response_model=list[NationalTurnoutTrend])
async def national_turnout_trends(
    election_type: str = Query("GE"),
    _user: dict | None = Depends(get_current_user),
):
    cache_key = f"national_turnout_trends:{election_type}"

    async def _fetch_turnout_trends():
        pool = await get_pool()
        et_display = _et_display(election_type)

        # Try materialized view first
        try:
            mv_rows = await pool.fetch(
                "SELECT * FROM mv_national_turnout_trends WHERE election_type = $1 ORDER BY year",
                et_display,
            )
            if mv_rows:
                result = [
                    NationalTurnoutTrend(
                        year=r["year"],
                        avg_turnout=_safe_float(r["avg_turnout"], 2) or 0.0,
                        total_electors=r["total_electors"],
                        states_counted=r["states_counted"],
                    )
                    for r in mv_rows
                ]
                return [item.model_dump() for item in result]
        except Exception:
            logger.debug("mv_national_turnout_trends not available, using CTE query")

        et_sql = _et_filter(election_type)

        rows = await pool.fetch(f"""
            WITH per_constituency AS (
                SELECT year, state_name, constituency_no,
                       MAX(electors) AS max_electors,
                       MAX(CASE WHEN position = 1 THEN turnout_percentage END) AS turnout_pct
                FROM tcpd_ae
                WHERE {et_sql}
                  AND (poll_no = 0 OR poll_no IS NULL)
                  AND state_name NOT IN ('Mysore', 'Madras', 'Goa_Daman_&_Diu', 'Goa,_Daman_&_Diu')
                GROUP BY year, state_name, constituency_no
            )
            SELECT year,
                   AVG(turnout_pct) AS avg_turnout,
                   SUM(max_electors) AS total_electors,
                   COUNT(DISTINCT state_name) AS states_counted
            FROM per_constituency
            WHERE turnout_pct IS NOT NULL
            GROUP BY year
            ORDER BY year
        """)

        result = [
            NationalTurnoutTrend(
                year=r["year"],
                avg_turnout=_safe_float(r["avg_turnout"], 2) or 0.0,
                total_electors=r["total_electors"],
                states_counted=r["states_counted"],
            )
            for r in rows
        ]
        return [item.model_dump() for item in result]

    return await get_cached_with_lock(cache_key, _NATIONAL_CACHE_TTL, _fetch_turnout_trends)


# ---------------------------------------------------------------------------
# GET /national/upcoming-elections  (public — no auth required)
# ---------------------------------------------------------------------------
@router.get("/upcoming-elections", response_model=list[UpcomingElection])
async def upcoming_elections():
    cache_key = "national_upcoming"
    cached = await get_cached(cache_key)
    if cached:
        return cached

    pool = await get_pool()
    current_year = datetime.now().year

    rows = await pool.fetch("""
        SELECT state_name,
               CASE WHEN election_type ILIKE '%%(AE)%%' THEN 'AE' ELSE 'GE' END AS et_code,
               MAX(year) AS last_year
        FROM tcpd_ae
        WHERE (poll_no = 0 OR poll_no IS NULL)
          AND state_name IS NOT NULL
          AND state_name NOT IN ('Mysore', 'Madras', 'Goa_Daman_&_Diu', 'Goa,_Daman_&_Diu')
        GROUP BY state_name, et_code
        ORDER BY state_name
    """)

    result = []
    for r in rows:
        last_year = r["last_year"]
        est_next = last_year + 5
        if est_next >= current_year:
            result.append(UpcomingElection(
                state_name=r["state_name"],
                display_name=r["state_name"].replace("_", " "),
                last_election_year=last_year,
                estimated_next_year=est_next,
                election_type_code=r["et_code"],
            ))

    result.sort(key=lambda x: (x.estimated_next_year, x.state_name))
    await set_cached(cache_key, [item.model_dump() for item in result], ttl=_NATIONAL_CACHE_TTL)
    return result


# ---------------------------------------------------------------------------
# GET /national/compare
# ---------------------------------------------------------------------------
@router.get("/compare")
async def compare_states(
    state_a: str = Query(...),
    state_b: str = Query(...),
    election_type: str = Query("AE"),
    _user: dict | None = Depends(get_current_user),
):
    key_states = tuple(sorted([state_a, state_b]))
    cache_key = f"national_compare:{key_states}:{election_type}"
    cached = await get_cached(cache_key)
    if cached:
        return cached

    pool = await get_pool()
    et_sql = _et_filter(election_type)

    async def _state_data(state: str) -> dict:
        # Summary stats
        summary = await pool.fetchrow(f"""
            SELECT COUNT(*) AS total_records,
                   COUNT(DISTINCT year) AS total_years,
                   MIN(year) AS year_min, MAX(year) AS year_max,
                   COUNT(DISTINCT constituency_name) AS total_constituencies,
                   AVG(turnout_percentage) FILTER (WHERE position = 1) AS avg_turnout
            FROM tcpd_ae
            WHERE state_name = $1 AND {et_sql}
              AND (poll_no = 0 OR poll_no IS NULL)
        """, state)

        # Top parties (latest election)
        latest_year = summary["year_max"]
        parties = []
        if latest_year:
            party_rows = await pool.fetch(f"""
                SELECT party, COUNT(*) AS seats_won,
                       AVG(vote_share_percentage) AS avg_vs
                FROM tcpd_ae
                WHERE state_name = $1 AND year = $2 AND position = 1
                  AND {et_sql} AND (poll_no = 0 OR poll_no IS NULL)
                GROUP BY party
                ORDER BY seats_won DESC
                LIMIT 8
            """, state, latest_year)
            parties = [
                {
                    "party": _normalize_party(r["party"]),
                    "seats_won": r["seats_won"],
                    "avg_vote_share": _safe_float(r["avg_vs"], 2),
                }
                for r in party_rows
            ]

        # Turnout trend per year
        turnout_rows = await pool.fetch(f"""
            SELECT year, AVG(turnout_percentage) AS avg_turnout
            FROM tcpd_ae
            WHERE state_name = $1 AND {et_sql}
              AND position = 1
              AND (poll_no = 0 OR poll_no IS NULL)
              AND turnout_percentage IS NOT NULL
            GROUP BY year ORDER BY year
        """, state)
        turnout_trend = [
            {"year": r["year"], "avg_turnout": _safe_float(r["avg_turnout"], 2) or 0.0}
            for r in turnout_rows
        ]

        return {
            "state_name": state,
            "display_name": state.replace("_", " "),
            "total_constituencies": summary["total_constituencies"],
            "total_years": summary["total_years"],
            "year_min": summary["year_min"],
            "year_max": summary["year_max"],
            "avg_turnout": _safe_float(summary["avg_turnout"], 1),
            "top_parties": parties,
            "turnout_trend": turnout_trend,
        }

    data_a = await _state_data(state_a)
    data_b = await _state_data(state_b)

    result = {"state_a": data_a, "state_b": data_b}
    await set_cached(cache_key, result, ttl=_NATIONAL_CACHE_TTL)
    return result


# ---------------------------------------------------------------------------
# GET /national/party-map
# ---------------------------------------------------------------------------
@router.get("/party-map", response_model=list[PartyMapEntry])
async def party_map(
    party: str = Query(...),
    election_type: str = Query("AE"),
    _user: dict | None = Depends(get_current_user),
):
    cache_key = f"national_party_map:{party}:{election_type}"
    cached = await get_cached(cache_key)
    if cached:
        return cached

    pool = await get_pool()
    et_sql = _et_filter(election_type)

    # Find all variants of this party
    norm = _normalize_party(party)
    # Build list of raw party names that normalize to the same thing
    all_parties = await pool.fetch(f"""
        SELECT DISTINCT party FROM tcpd_ae
        WHERE {et_sql} AND position = 1
          AND (poll_no = 0 OR poll_no IS NULL)
          AND party IS NOT NULL
    """)
    matching = [r["party"] for r in all_parties if _normalize_party(r["party"]) == norm]
    if not matching:
        await set_cached(cache_key, [], ttl=_NATIONAL_CACHE_TTL)
        return []

    rows = await pool.fetch(f"""
        WITH latest AS (
            SELECT state_name, MAX(year) AS latest_year
            FROM tcpd_ae
            WHERE {et_sql} AND (poll_no = 0 OR poll_no IS NULL)
              AND state_name NOT IN ('Mysore', 'Madras', 'Goa_Daman_&_Diu', 'Goa,_Daman_&_Diu')
            GROUP BY state_name
        ),
        totals AS (
            SELECT t.state_name, COUNT(*) AS total_seats
            FROM tcpd_ae t
            JOIN latest l ON t.state_name = l.state_name AND t.year = l.latest_year
            WHERE t.position = 1 AND {et_sql}
              AND (t.poll_no = 0 OR t.poll_no IS NULL)
            GROUP BY t.state_name
        ),
        party_seats AS (
            SELECT t.state_name, l.latest_year,
                   COUNT(*) AS seats_won,
                   AVG(t.vote_share_percentage) AS avg_vs
            FROM tcpd_ae t
            JOIN latest l ON t.state_name = l.state_name AND t.year = l.latest_year
            WHERE t.position = 1 AND {et_sql}
              AND (t.poll_no = 0 OR t.poll_no IS NULL)
              AND t.party = ANY($1)
            GROUP BY t.state_name, l.latest_year
        )
        SELECT ps.state_name, ps.latest_year, ps.seats_won, ps.avg_vs,
               tot.total_seats
        FROM party_seats ps
        JOIN totals tot ON ps.state_name = tot.state_name
        ORDER BY ps.seats_won DESC
    """, matching)

    result = [
        PartyMapEntry(
            state_name=r["state_name"],
            display_name=r["state_name"].replace("_", " "),
            seats_won=r["seats_won"],
            total_seats=r["total_seats"],
            vote_share=_safe_float(r["avg_vs"], 2),
            year=r["latest_year"],
        )
        for r in rows
    ]

    await set_cached(cache_key, [item.model_dump() for item in result], ttl=_NATIONAL_CACHE_TTL)
    return result


# ---------------------------------------------------------------------------
# Cache warming (called from main.py lifespan)
# ---------------------------------------------------------------------------
async def warm_cache():
    """Pre-compute commonly used national queries."""
    pool = await get_pool()
    _fake_user = {"sub": "cache-warm"}
    for fn, kwargs in [
        (upcoming_elections, {}),
        (national_state_summary, {"election_type": "AE", "_user": _fake_user}),
        (national_state_summary, {"election_type": "GE", "_user": _fake_user}),
        (national_party_strength, {"election_type": "AE", "_user": _fake_user}),
        (national_party_strength, {"election_type": "GE", "_user": _fake_user}),
    ]:
        try:
            await fn(**kwargs)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Materialized view refresh
# ---------------------------------------------------------------------------
_MV_NAMES = [
    "mv_national_state_summary",
    "mv_national_party_strength",
    "mv_national_turnout_trends",
]


async def refresh_materialized_views(pool=None):
    """Refresh all national materialized views concurrently (non-blocking reads)."""
    if pool is None:
        pool = await get_pool()
    for mv in _MV_NAMES:
        try:
            await pool.execute(f"REFRESH MATERIALIZED VIEW CONCURRENTLY {mv}")
            logger.info("Refreshed materialized view %s", mv)
        except Exception as e:
            logger.warning("Failed to refresh %s: %s", mv, e)
