from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse

from auth import get_current_user, require_user
from database import get_pool
from models import (
    CandidateResult,
    ConstituencyPredictionData,
    ConstituencySummary,
    ConstituencySwing,
    ConstituencySwingRow,
    ConstituencyResult,
    DistrictSummary,
    Election,
    ElectionListItem,
    PaginatedElections,
    PaginatedElectionsList,
    PartySummary,
    PredictionDataResponse,
    StateInfo,
    StateSwingSummary,
    StatsSummary,
    YearSummary,
)

router = APIRouter()

# ── Server-side response cache (Redis-backed with in-memory fallback) ──
from cache import get_cached as _get_cached_async, set_cached as _set_cached_async
import time as _time
_CACHE_TTL = 86400  # 24 hours — election data is static between ingestion events

# Sync wrappers are replaced by async calls in the endpoints
# Keep legacy dict for backward compat during transition
_response_cache: dict[str, tuple[float, any]] = {}


def _get_cached(key: str):
    """Sync fallback — check in-memory only (async endpoints use _get_cached_async)."""
    entry = _response_cache.get(key)
    if entry and _time.time() - entry[0] < _CACHE_TTL:
        return entry[1]
    return None


def _set_cached(key: str, data):
    """Sync fallback — store in-memory only."""
    _response_cache[key] = (_time.time(), data)


def _row_to_election(row) -> Election:
    return Election(**dict(row))


_ELECTION_LIST_COLS = (
    "id, year, state_name, constituency_name, constituency_no, party, candidate, "
    "votes, vote_share_percentage, position, margin, turnout_percentage, "
    "election_type, district_name"
)


def _row_to_election_list_item(row) -> ElectionListItem:
    return ElectionListItem(**dict(row))


# ---------------------------------------------------------------------------
# Election type SQL filter helper
# ---------------------------------------------------------------------------
def _et_filter(election_type: str) -> str:
    """Return SQL condition for election_type matching."""
    if election_type.upper() == "GE":
        return "election_type = 'Lok Sabha Election (GE)'"
    return "election_type = 'State Assembly Election (AE)'"


def _et_display(election_type: str) -> str:
    """Return full display string for election type code."""
    if election_type.upper() == "GE":
        return "Lok Sabha Election (GE)"
    return "State Assembly Election (AE)"


# ---------------------------------------------------------------------------
# Server-side party normalization
# ---------------------------------------------------------------------------
_PARTY_ALIASES = {
    'INC(I)': 'INC', 'INC (I)': 'INC',
    'ADK': 'ADMK', 'AIADMK': 'ADMK', 'ADK(JL)': 'ADMK',
    'BHP': 'BJP', 'B.J.P': 'BJP', 'B.J.P.': 'BJP',
    'S.P': 'SP', 'S.P.': 'SP',
    'JD(S)': 'JDS', 'JD (S)': 'JDS',
    'JD(U)': 'JDU', 'JD (U)': 'JDU',
    'B.S.P.': 'BSP', 'B.S.P': 'BSP', 'BSP(K)': 'BSP', 'BSP (K)': 'BSP',
    'SHS': 'SS', 'ShivSena': 'SS', 'SHIV SENA': 'SS',
    'TRS': 'BRS',
}


def _normalize_party(name: str | None) -> str:
    if not name:
        return 'IND'
    return _PARTY_ALIASES.get(name.strip(), name.strip())


# ---------------------------------------------------------------------------
# General election year detection — per-state + election_type
# ---------------------------------------------------------------------------
_GENERAL_YEARS_CACHE: dict[str, list[int]] = {}


async def _get_general_years(pool, state: str, election_type: str = "AE") -> list[int]:
    cache_key = f"{state}:{election_type}"
    if cache_key in _GENERAL_YEARS_CACHE:
        return _GENERAL_YEARS_CACHE[cache_key]

    et_sql = _et_filter(election_type)
    rows = await pool.fetch(f"""
        WITH year_counts AS (
            SELECT year, COUNT(DISTINCT constituency_name) AS n
            FROM tcpd_ae
            WHERE state_name = $1
              AND {et_sql}
              AND (poll_no = 0 OR poll_no IS NULL)
            GROUP BY year
        ),
        max_count AS (
            SELECT MAX(n) AS max_n FROM year_counts
        )
        SELECT yc.year FROM year_counts yc, max_count mc
        WHERE yc.n >= mc.max_n * 0.4
        ORDER BY yc.year
    """, state)

    result = [r["year"] for r in rows]
    _GENERAL_YEARS_CACHE[cache_key] = result
    return result


# ---------------------------------------------------------------------------
# GET /states  — list available states with metadata
# ---------------------------------------------------------------------------
_EXCLUDED_STATES = {'Mysore', 'Madras', 'Goa_Daman_&_Diu', 'Goa,_Daman_&_Diu'}


@router.get("/states", response_model=list[StateInfo])
async def list_states():
    cached = _get_cached("states_list")
    if cached:
        return cached

    pool = await get_pool()
    rows = await pool.fetch("""
        SELECT state_name,
            ARRAY_AGG(DISTINCT election_type) AS election_types,
            MIN(CASE WHEN election_type = 'State Assembly Election (AE)' THEN year END) AS ae_year_min,
            MAX(CASE WHEN election_type = 'State Assembly Election (AE)' THEN year END) AS ae_year_max,
            MIN(CASE WHEN election_type = 'Lok Sabha Election (GE)' THEN year END) AS ge_year_min,
            MAX(CASE WHEN election_type = 'Lok Sabha Election (GE)' THEN year END) AS ge_year_max,
            COUNT(DISTINCT CASE WHEN election_type = 'State Assembly Election (AE)'
                THEN constituency_name END) AS ae_constituencies,
            COUNT(DISTINCT CASE WHEN election_type = 'Lok Sabha Election (GE)'
                THEN constituency_name END) AS ge_constituencies
        FROM tcpd_ae
        WHERE state_name IS NOT NULL
        GROUP BY state_name
        ORDER BY state_name
    """)

    result = []
    for r in rows:
        sn = r["state_name"]
        if sn in _EXCLUDED_STATES:
            continue
        latest_ae = r["ae_year_max"]
        etypes = []
        for et in (r["election_types"] or []):
            if et and "(" in et:
                etypes.append(et.split("(")[-1].rstrip(")"))
            elif et:
                etypes.append(et)
        result.append(StateInfo(
            state_name=sn,
            display_name=sn.replace("_", " "),
            election_types=etypes,
            ae_year_min=r["ae_year_min"],
            ae_year_max=r["ae_year_max"],
            ge_year_min=r["ge_year_min"],
            ge_year_max=r["ge_year_max"],
            ae_constituencies=r["ae_constituencies"],
            ge_constituencies=r["ge_constituencies"],
            latest_ae_general_year=latest_ae,
            next_election_est=(latest_ae + 5) if latest_ae else None,
        ))

    _set_cached("states_list", result)
    return result


# ---------------------------------------------------------------------------
# GET /elections  — paginated list with optional filters
# ---------------------------------------------------------------------------
@router.get("/elections", response_model=PaginatedElectionsList)
async def list_elections(
    state: str = Query(...),
    year: int | None = None,
    party: str | None = None,
    constituency_name: str | None = None,
    district_name: str | None = None,
    candidate: str | None = None,
    sex: str | None = None,
    constituency_type: str | None = None,
    sub_region: str | None = None,
    election_type: str | None = None,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    _user: dict | None = Depends(get_current_user),
):
    pool = await get_pool()

    conditions: list[str] = []
    params: list = []
    idx = 1

    filters = {
        "state_name": state,
        "year": year,
        "party": party,
        "constituency_name": constituency_name,
        "district_name": district_name,
        "sex": sex,
        "constituency_type": constituency_type,
        "sub_region": sub_region,
        "election_type": election_type,
    }
    for col, val in filters.items():
        if val is not None:
            conditions.append(f"{col} = ${idx}")
            params.append(val)
            idx += 1

    if candidate is not None:
        conditions.append(f"candidate ILIKE ${idx}")
        params.append(f"%{candidate}%")
        idx += 1

    where = f" WHERE {' AND '.join(conditions)}" if conditions else ""

    count_sql = f"SELECT COUNT(*) FROM tcpd_ae{where}"
    total = await pool.fetchval(count_sql, *params)

    data_sql = (
        f"SELECT {_ELECTION_LIST_COLS} FROM tcpd_ae{where} ORDER BY year, constituency_no, position"
        f" LIMIT ${idx} OFFSET ${idx + 1}"
    )
    params.extend([limit, offset])
    rows = await pool.fetch(data_sql, *params)

    return PaginatedElectionsList(
        total=total,
        limit=limit,
        offset=offset,
        data=[_row_to_election_list_item(r) for r in rows],
    )


# ---------------------------------------------------------------------------
# GET /elections/{id}  — single record by primary key
# ---------------------------------------------------------------------------
@router.get("/elections/{record_id}", response_model=Election)
async def get_election(record_id: int, _user: dict | None = Depends(get_current_user)):
    pool = await get_pool()
    row = await pool.fetchrow("SELECT * FROM tcpd_ae WHERE id = $1", record_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Record not found")
    return _row_to_election(row)


# ---------------------------------------------------------------------------
# GET /elections/{year}/results  — winners (position=1) for a given year
# ---------------------------------------------------------------------------
@router.get("/elections/{year}/results", response_model=list[ElectionListItem])
async def get_year_results(year: int, state: str = Query(...), election_type: str = Query("AE"), _user: dict | None = Depends(get_current_user)):
    pool = await get_pool()
    et_sql = _et_filter(election_type)
    rows = await pool.fetch(
        f"SELECT {_ELECTION_LIST_COLS} FROM tcpd_ae WHERE year = $1 AND state_name = $2 AND position = 1 AND {et_sql}"
        f" ORDER BY constituency_no",
        year, state,
    )
    if not rows:
        raise HTTPException(status_code=404, detail=f"No results for year {year}")
    return [_row_to_election_list_item(r) for r in rows]


# ---------------------------------------------------------------------------
# GET /years  — distinct years with candidate counts
# ---------------------------------------------------------------------------
@router.get("/years", response_model=list[YearSummary])
async def list_years(state: str = Query(...), election_type: str = Query("AE"), _user: dict | None = Depends(get_current_user)):
    pool = await get_pool()
    et_sql = _et_filter(election_type)
    rows = await pool.fetch(
        f"SELECT year, COUNT(*) AS candidate_count FROM tcpd_ae"
        f" WHERE state_name = $1 AND {et_sql} GROUP BY year ORDER BY year",
        state,
    )
    return [YearSummary(**dict(r)) for r in rows]


# ---------------------------------------------------------------------------
# GET /parties  — distinct parties with total votes and candidate counts
# ---------------------------------------------------------------------------
@router.get("/parties", response_model=list[PartySummary])
async def list_parties(state: str = Query(...), election_type: str = Query("AE"), _user: dict | None = Depends(get_current_user)):
    pool = await get_pool()
    et_sql = _et_filter(election_type)
    rows = await pool.fetch(
        f"SELECT party, COUNT(*) AS candidate_count,"
        f" COALESCE(SUM(votes), 0) AS total_votes"
        f" FROM tcpd_ae WHERE state_name = $1 AND {et_sql} GROUP BY party ORDER BY total_votes DESC",
        state,
    )
    # Merge party variants using server-side normalization
    merged: dict[str, dict] = {}
    for r in rows:
        norm = _normalize_party(r["party"])
        if norm not in merged:
            merged[norm] = {"party": norm, "candidate_count": 0, "total_votes": 0}
        merged[norm]["candidate_count"] += r["candidate_count"]
        merged[norm]["total_votes"] += r["total_votes"]
    return sorted(merged.values(), key=lambda x: x["total_votes"], reverse=True)


# ---------------------------------------------------------------------------
# GET /constituencies  — distinct constituencies with district
# ---------------------------------------------------------------------------
@router.get("/constituencies", response_model=list[ConstituencySummary])
async def list_constituencies(state: str = Query(...), election_type: str = Query("AE"), _user: dict | None = Depends(get_current_user)):
    pool = await get_pool()
    et_sql = _et_filter(election_type)
    rows = await pool.fetch(
        f"SELECT DISTINCT constituency_name, constituency_type, district_name"
        f" FROM tcpd_ae WHERE state_name = $1 AND {et_sql} ORDER BY constituency_name",
        state,
    )
    return [ConstituencySummary(**dict(r)) for r in rows]


# ---------------------------------------------------------------------------
# GET /districts  — distinct districts with sub_region and constituency count
# ---------------------------------------------------------------------------
@router.get("/districts", response_model=list[DistrictSummary])
async def list_districts(state: str = Query(...), election_type: str = Query("AE"), _user: dict | None = Depends(get_current_user)):
    pool = await get_pool()
    et_sql = _et_filter(election_type)
    rows = await pool.fetch(
        f"SELECT district_name, sub_region,"
        f" COUNT(DISTINCT constituency_name) AS constituency_count"
        f" FROM tcpd_ae WHERE state_name = $1 AND {et_sql} GROUP BY district_name, sub_region"
        f" ORDER BY district_name",
        state,
    )
    return [DistrictSummary(**dict(r)) for r in rows]


# ---------------------------------------------------------------------------
# GET /candidates  — search candidates by name with optional year/party/state filter
# ---------------------------------------------------------------------------
@router.get("/candidates", response_model=list[ElectionListItem])
async def search_candidates(
    name: str = Query(..., min_length=2),
    year: int | None = None,
    party: str | None = None,
    state: str | None = None,
    election_type: str | None = None,
    limit: int = Query(default=50, ge=1, le=500),
    _user: dict | None = Depends(get_current_user),
):
    pool = await get_pool()

    conditions = ["candidate ILIKE $1"]
    params: list = [f"%{name}%"]
    idx = 2

    if year is not None:
        conditions.append(f"year = ${idx}")
        params.append(year)
        idx += 1
    if party is not None:
        conditions.append(f"party = ${idx}")
        params.append(party)
        idx += 1
    if state is not None:
        conditions.append(f"state_name = ${idx}")
        params.append(state)
        idx += 1
    if election_type is not None:
        conditions.append(_et_filter(election_type))

    where = " AND ".join(conditions)
    params.append(limit)

    rows = await pool.fetch(
        f"SELECT {_ELECTION_LIST_COLS} FROM tcpd_ae WHERE {where}"
        f" ORDER BY year DESC, votes DESC LIMIT ${idx}",
        *params,
    )
    return [_row_to_election_list_item(r) for r in rows]


# ---------------------------------------------------------------------------
# GET /stats/summary  — aggregate statistics (state-scoped)
# ---------------------------------------------------------------------------
@router.get("/stats/summary", response_model=StatsSummary)
async def stats_summary(state: str = Query(...), election_type: str = Query("AE")):
    cache_key = f"stats_summary:{state}:{election_type}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    pool = await get_pool()
    et_sql = _et_filter(election_type)
    row = await pool.fetchrow(f"""
        WITH agg AS (
            SELECT COUNT(*) AS total_records,
                COUNT(DISTINCT year) AS total_years,
                MIN(year) AS year_min, MAX(year) AS year_max,
                COUNT(DISTINCT party) AS total_parties,
                COUNT(DISTINCT constituency_name) AS total_constituencies,
                COUNT(DISTINCT district_name) AS total_districts
            FROM tcpd_ae
            WHERE state_name = $1 AND {et_sql}
        ),
        meta AS (
            SELECT state_name, election_type FROM tcpd_ae
            WHERE state_name = $1 AND {et_sql} LIMIT 1
        )
        SELECT agg.*, meta.state_name, meta.election_type
        FROM agg, meta
    """, state)

    if row is None or row["total_records"] is None or row["total_records"] == 0:
        raise HTTPException(status_code=404, detail=f"No {election_type} data for state: {state}")

    general_years = await _get_general_years(pool, state, election_type)
    latest_year = general_years[-1] if general_years else row["year_max"]
    next_election_year = (latest_year + 5) if latest_year else None

    electors = None
    if latest_year is not None:
        electors = await pool.fetchval(f"""
            SELECT SUM(DISTINCT e.electors) FROM
            (SELECT constituency_no, MAX(electors) AS electors FROM tcpd_ae
             WHERE year = $1 AND state_name = $2 AND (poll_no = 0 OR poll_no IS NULL) AND {et_sql}
             GROUP BY constituency_no) e
        """, latest_year, state)

    result = StatsSummary(
        total_records=row["total_records"],
        total_years=row["total_years"],
        year_min=row["year_min"],
        year_max=row["year_max"],
        total_parties=row["total_parties"],
        total_constituencies=row["total_constituencies"],
        total_districts=row["total_districts"],
        state_name=state.replace("_", " "),
        election_type=row["election_type"],
        election_type_code=election_type.upper(),
        general_years=general_years,
        next_election_year=next_election_year,
        total_electors_latest=electors,
    )
    _set_cached(cache_key, result)
    return result


# ---------------------------------------------------------------------------
# GET /swings/constituency/{name}  — year-by-year results for a constituency
# ---------------------------------------------------------------------------
@router.get("/swings/constituency/{name}", response_model=ConstituencySwing)
async def constituency_swing(name: str, state: str = Query(...), election_type: str = Query("AE"), _user: dict | None = Depends(get_current_user)):
    pool = await get_pool()
    general_years = await _get_general_years(pool, state, election_type)
    et_sql = _et_filter(election_type)
    meta = await pool.fetchrow(
        f"SELECT DISTINCT constituency_name, constituency_no, district_name,"
        f" sub_region, constituency_type"
        f" FROM tcpd_ae WHERE constituency_name = $1 AND state_name = $2 AND {et_sql} LIMIT 1", name, state
    )
    if meta is None:
        raise HTTPException(status_code=404, detail="Constituency not found")

    rows = await pool.fetch(
        f"SELECT year, constituency_name, constituency_no, candidate, party,"
        f" votes, position, margin, margin_percentage, turnout_percentage,"
        f" enop, valid_votes, electors, n_cand, vote_share_percentage"
        f" FROM tcpd_ae WHERE constituency_name = $1 AND state_name = $3 AND position <= 2"
        f" AND year = ANY($2) AND {et_sql}"
        f" ORDER BY year, position",
        name, general_years, state,
    )

    results: list[ConstituencyResult] = []
    by_year: dict = {}
    for r in rows:
        yr = r["year"]
        if yr not in by_year:
            by_year[yr] = {}
        by_year[yr][r["position"]] = dict(r)

    for yr in sorted(by_year.keys()):
        d = by_year[yr]
        w = d.get(1, {})
        ru = d.get(2, {})
        results.append(ConstituencyResult(
            year=yr,
            constituency_name=w.get("constituency_name"),
            constituency_no=w.get("constituency_no"),
            winner=w.get("candidate"),
            winner_party=w.get("party"),
            winner_votes=w.get("votes"),
            runner_up=ru.get("candidate"),
            runner_up_party=ru.get("party"),
            runner_up_votes=ru.get("votes"),
            margin=w.get("margin"),
            margin_percentage=w.get("margin_percentage"),
            turnout_percentage=w.get("turnout_percentage"),
            enop=w.get("enop"),
            valid_votes=w.get("valid_votes"),
            electors=w.get("electors"),
            n_cand=w.get("n_cand"),
        ))

    return ConstituencySwing(
        constituency_name=meta["constituency_name"],
        constituency_no=meta["constituency_no"],
        district_name=meta["district_name"],
        sub_region=meta["sub_region"],
        constituency_type=meta["constituency_type"],
        results=results,
    )


# ---------------------------------------------------------------------------
# GET /swings/state  — state-level party swing summary per general election
# ---------------------------------------------------------------------------
@router.get("/swings/state", response_model=list[StateSwingSummary])
async def state_swing(state: str = Query(...), election_type: str = Query("AE"), _user: dict | None = Depends(get_current_user)):
    cache_key = f"swings_state:{state}:{election_type}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    pool = await get_pool()
    general_years = await _get_general_years(pool, state, election_type)
    et_sql = _et_filter(election_type)
    rows = await pool.fetch(f"""
        WITH party_year AS (
            SELECT year, party,
                SUM(CASE WHEN position = 1 THEN 1 ELSE 0 END) AS seats_won,
                COUNT(DISTINCT constituency_no) AS total_seats,
                ROUND(AVG(vote_share_percentage)::numeric, 2) AS avg_vote_share,
                ROUND(AVG(CASE WHEN position = 1 THEN margin_percentage END)::numeric, 2) AS avg_margin
            FROM tcpd_ae
            WHERE year = ANY($1) AND party IS NOT NULL AND state_name = $2 AND {et_sql}
            GROUP BY year, party
            HAVING SUM(CASE WHEN position = 1 THEN 1 ELSE 0 END) >= 1
        ),
        with_lag AS (
            SELECT *,
                ROUND((avg_vote_share - LAG(avg_vote_share) OVER (
                    PARTITION BY party ORDER BY year
                ))::numeric, 2) AS swing_from_prev
            FROM party_year
        )
        SELECT * FROM with_lag ORDER BY year, seats_won DESC
    """, general_years, state)
    result = [StateSwingSummary(**dict(r)) for r in rows]
    _set_cached(cache_key, result)
    return result


# ---------------------------------------------------------------------------
# GET /swings/constituencies  — list all constituencies with their swing history
# ---------------------------------------------------------------------------
@router.get("/swings/constituencies", response_model=list[ConstituencySwingRow])
async def all_constituency_swings(state: str = Query(...), election_type: str = Query("AE"), _user: dict | None = Depends(get_current_user)):
    cache_key = f"swings_constituencies:{state}:{election_type}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    pool = await get_pool()
    general_years = await _get_general_years(pool, state, election_type)
    et_sql = _et_filter(election_type)
    rows = await pool.fetch(f"""
        SELECT constituency_name, constituency_no, district_name,
            sub_region, constituency_type, year,
            MAX(CASE WHEN position=1 THEN party END) AS winner_party,
            MAX(CASE WHEN position=1 THEN candidate END) AS winner,
            MAX(CASE WHEN position=1 THEN votes END) AS winner_votes,
            MAX(CASE WHEN position=1 THEN vote_share_percentage END) AS winner_vote_share,
            MAX(CASE WHEN position=2 THEN party END) AS runner_up_party,
            MAX(CASE WHEN position=1 THEN margin_percentage END) AS margin_percentage,
            MAX(CASE WHEN position=1 THEN turnout_percentage END) AS turnout_percentage
        FROM tcpd_ae
        WHERE position <= 2 AND year = ANY($1) AND state_name = $2 AND {et_sql}
        GROUP BY constituency_name, constituency_no, district_name,
            sub_region, constituency_type, year
        ORDER BY constituency_name, year
    """, general_years, state)
    result = [dict(r) for r in rows]
    _set_cached(cache_key, result)
    return result


# ---------------------------------------------------------------------------
# GET /predict/data  — full candidate breakdown for the last 2 elections
# ---------------------------------------------------------------------------
@router.get("/predict/data", response_model=PredictionDataResponse)
async def prediction_data(state: str = Query(...), election_type: str = Query("AE"), _user: dict = Depends(require_user)):
    if election_type.upper() != "AE":
        raise HTTPException(
            status_code=501,
            detail="Predictions are only available for State Assembly Elections (AE). "
                   "Lok Sabha elections have different political dynamics that require a separate model."
        )

    cache_key = f"predict_data:{state}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    pool = await get_pool()
    general_years = await _get_general_years(pool, state)

    if len(general_years) >= 2:
        latest_year, prev_year = general_years[-1], general_years[-2]
    elif len(general_years) == 1:
        latest_year, prev_year = general_years[0], general_years[0]
    else:
        latest_year, prev_year = 2021, 2016

    rows = await pool.fetch("""
        SELECT year, constituency_name, constituency_no, constituency_type,
            district_name, sub_region, party, votes, vote_share_percentage,
            position, valid_votes, electors, turnout_percentage, enop, n_cand,
            candidate, margin, margin_percentage
        FROM tcpd_ae
        WHERE year IN ($1, $2) AND state_name = $3
        ORDER BY constituency_name, year, position
    """, latest_year, prev_year, state)

    by_const: dict[str, dict] = {}

    for r in rows:
        cname = r["constituency_name"]
        yr = r["year"]

        if cname not in by_const:
            by_const[cname] = {
                "constituency_name": cname,
                "constituency_no": r["constituency_no"],
                "constituency_type": r["constituency_type"],
                "district_name": r["district_name"],
                "sub_region": r["sub_region"],
                "candidates_latest": [],
                "candidates_prev": [],
                "electors_latest": None,
                "valid_votes_latest": None,
                "turnout_percentage_latest": None,
                "enop_latest": None,
                "n_cand_latest": None,
                "winner_latest": None,
                "winner_party_latest": None,
                "margin_latest": None,
                "margin_percentage_latest": None,
            }

        entry = by_const[cname]
        cand = CandidateResult(
            party=r["party"],
            votes=r["votes"],
            vote_share_percentage=r["vote_share_percentage"],
            position=r["position"],
        )

        if yr == latest_year:
            entry["candidates_latest"].append(cand)
            if entry["electors_latest"] is None:
                entry["electors_latest"] = r["electors"]
                entry["valid_votes_latest"] = r["valid_votes"]
                entry["turnout_percentage_latest"] = r["turnout_percentage"]
                entry["enop_latest"] = r["enop"]
                entry["n_cand_latest"] = r["n_cand"]
            if r["position"] == 1:
                entry["winner_latest"] = r["candidate"]
                entry["winner_party_latest"] = r["party"]
                entry["margin_latest"] = r["margin"]
                entry["margin_percentage_latest"] = r["margin_percentage"]
        elif yr == prev_year:
            entry["candidates_prev"].append(cand)

    constituencies = [
        ConstituencyPredictionData(**v) for v in by_const.values()
    ]

    total_electors_latest = sum(
        c.electors_latest for c in constituencies if c.electors_latest
    )

    result = PredictionDataResponse(
        total_electors_next=total_electors_latest,
        total_electors_latest=total_electors_latest,
        latest_year=latest_year,
        prev_year=prev_year,
        constituency_count=len(constituencies),
        constituencies=constituencies,
    )
    _set_cached(cache_key, result)
    return result
