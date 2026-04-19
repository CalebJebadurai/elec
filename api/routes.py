from fastapi import APIRouter, Depends, HTTPException, Query

from auth import require_user
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
    PaginatedElections,
    PartySummary,
    PredictionDataResponse,
    StateSwingSummary,
    StatsSummary,
    YearSummary,
)

router = APIRouter()


def _row_to_election(row) -> Election:
    return Election(**dict(row))


# ---------------------------------------------------------------------------
# GET /elections  — paginated list with optional filters
# ---------------------------------------------------------------------------
@router.get("/elections", response_model=PaginatedElections)
async def list_elections(
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
    _user: dict = Depends(require_user),
):
    pool = await get_pool()

    conditions: list[str] = []
    params: list = []
    idx = 1

    filters = {
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
        f"SELECT * FROM tcpd_ae{where} ORDER BY year, constituency_no, position"
        f" LIMIT ${idx} OFFSET ${idx + 1}"
    )
    params.extend([limit, offset])
    rows = await pool.fetch(data_sql, *params)

    return PaginatedElections(
        total=total,
        limit=limit,
        offset=offset,
        data=[_row_to_election(r) for r in rows],
    )


# ---------------------------------------------------------------------------
# GET /elections/{id}  — single record by primary key
# ---------------------------------------------------------------------------
@router.get("/elections/{record_id}", response_model=Election)
async def get_election(record_id: int, _user: dict = Depends(require_user)):
    pool = await get_pool()
    row = await pool.fetchrow("SELECT * FROM tcpd_ae WHERE id = $1", record_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Record not found")
    return _row_to_election(row)


# ---------------------------------------------------------------------------
# GET /elections/{year}/results  — winners (position=1) for a given year
# ---------------------------------------------------------------------------
@router.get("/elections/{year}/results", response_model=list[Election])
async def get_year_results(year: int, _user: dict = Depends(require_user)):
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT * FROM tcpd_ae WHERE year = $1 AND position = 1"
        " ORDER BY constituency_no",
        year,
    )
    if not rows:
        raise HTTPException(status_code=404, detail=f"No results for year {year}")
    return [_row_to_election(r) for r in rows]


# ---------------------------------------------------------------------------
# GET /years  — distinct years with candidate counts
# ---------------------------------------------------------------------------
@router.get("/years", response_model=list[YearSummary])
async def list_years(_user: dict = Depends(require_user)):
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT year, COUNT(*) AS candidate_count FROM tcpd_ae"
        " GROUP BY year ORDER BY year"
    )
    return [YearSummary(**dict(r)) for r in rows]


# ---------------------------------------------------------------------------
# GET /parties  — distinct parties with total votes and candidate counts
# ---------------------------------------------------------------------------
@router.get("/parties", response_model=list[PartySummary])
async def list_parties(_user: dict = Depends(require_user)):
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT party, COUNT(*) AS candidate_count,"
        " COALESCE(SUM(votes), 0) AS total_votes"
        " FROM tcpd_ae GROUP BY party ORDER BY total_votes DESC"
    )
    return [PartySummary(**dict(r)) for r in rows]


# ---------------------------------------------------------------------------
# GET /constituencies  — distinct constituencies with district
# ---------------------------------------------------------------------------
@router.get("/constituencies", response_model=list[ConstituencySummary])
async def list_constituencies(_user: dict = Depends(require_user)):
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT DISTINCT constituency_name, constituency_type, district_name"
        " FROM tcpd_ae ORDER BY constituency_name"
    )
    return [ConstituencySummary(**dict(r)) for r in rows]


# ---------------------------------------------------------------------------
# GET /districts  — distinct districts with sub_region and constituency count
# ---------------------------------------------------------------------------
@router.get("/districts", response_model=list[DistrictSummary])
async def list_districts(_user: dict = Depends(require_user)):
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT district_name, sub_region,"
        " COUNT(DISTINCT constituency_name) AS constituency_count"
        " FROM tcpd_ae GROUP BY district_name, sub_region"
        " ORDER BY district_name"
    )
    return [DistrictSummary(**dict(r)) for r in rows]


# ---------------------------------------------------------------------------
# GET /candidates  — search candidates by name with optional year/party filter
# ---------------------------------------------------------------------------
@router.get("/candidates", response_model=list[Election])
async def search_candidates(
    name: str = Query(..., min_length=2),
    year: int | None = None,
    party: str | None = None,
    limit: int = Query(default=50, ge=1, le=500),
    _user: dict = Depends(require_user),
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

    where = " AND ".join(conditions)
    params.append(limit)

    rows = await pool.fetch(
        f"SELECT * FROM tcpd_ae WHERE {where}"
        f" ORDER BY year DESC, votes DESC LIMIT ${idx}",
        *params,
    )
    return [_row_to_election(r) for r in rows]


# ---------------------------------------------------------------------------
# GET /stats/summary  — aggregate statistics
# ---------------------------------------------------------------------------
@router.get("/stats/summary", response_model=StatsSummary)
async def stats_summary():
    try:
        pool = await get_pool()
        row = await pool.fetchrow(
            "SELECT COUNT(*) AS total_records,"
            " COUNT(DISTINCT year) AS total_years,"
            " MIN(year) AS year_min,"
            " MAX(year) AS year_max,"
            " COUNT(DISTINCT party) AS total_parties,"
            " COUNT(DISTINCT constituency_name) AS total_constituencies,"
            " COUNT(DISTINCT district_name) AS total_districts"
            " FROM tcpd_ae"
        )
        # Derive state/election type and general election years from the data
        state_row = await pool.fetchrow(
            "SELECT state_name, election_type FROM tcpd_ae"
            " WHERE state_name IS NOT NULL LIMIT 1"
        )
        year_rows = await pool.fetch(
            "SELECT year FROM ("
            "  SELECT year, COUNT(DISTINCT constituency_name) AS n"
            "  FROM tcpd_ae GROUP BY year"
            "  HAVING COUNT(DISTINCT constituency_name) > 50"
            ") sub ORDER BY year"
        )
        general_years = [r["year"] for r in year_rows]
        latest_year = general_years[-1] if general_years else dict(row)["year_max"]

        # Estimate next election year (typically 5 years after the last)
        next_election_year = latest_year + 5

        # Get total electors from the latest election
        electors = await pool.fetchval(
            "SELECT SUM(DISTINCT e.electors) FROM "
            "(SELECT constituency_no, MAX(electors) AS electors FROM tcpd_ae"
            " WHERE year = $1 GROUP BY constituency_no) e",
            latest_year,
        )

        return StatsSummary(
            **dict(row),
            state_name=state_row["state_name"].replace("_", " ") if state_row and state_row["state_name"] else None,
            election_type=state_row["election_type"] if state_row else None,
            general_years=general_years,
            next_election_year=next_election_year,
            total_electors_latest=electors,
        )
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}\n{traceback.format_exc()}")


# ---------------------------------------------------------------------------
# GET /swings/constituency/{name}  — year-by-year results for a constituency
# ---------------------------------------------------------------------------
# General election years are derived from data; this is a fallback
_GENERAL_YEARS_CACHE: list[int] | None = None


async def _get_general_years(pool) -> list[int]:
    global _GENERAL_YEARS_CACHE
    if _GENERAL_YEARS_CACHE is None:
        # Only include years with a significant number of constituencies
        # (filters out by-elections which typically cover 1-5 seats)
        rows = await pool.fetch(
            "SELECT year, COUNT(DISTINCT constituency_name) AS n"
            " FROM tcpd_ae GROUP BY year"
            " HAVING COUNT(DISTINCT constituency_name) > 50"
            " ORDER BY year"
        )
        _GENERAL_YEARS_CACHE = [r["year"] for r in rows]
    return _GENERAL_YEARS_CACHE


@router.get("/swings/constituency/{name}", response_model=ConstituencySwing)
async def constituency_swing(name: str, _user: dict = Depends(require_user)):
    pool = await get_pool()
    general_years = await _get_general_years(pool)
    # Get metadata
    meta = await pool.fetchrow(
        "SELECT DISTINCT constituency_name, constituency_no, district_name,"
        " sub_region, constituency_type"
        " FROM tcpd_ae WHERE constituency_name = $1 LIMIT 1", name
    )
    if meta is None:
        raise HTTPException(status_code=404, detail="Constituency not found")

    rows = await pool.fetch(
        "SELECT year, constituency_name, constituency_no, candidate, party,"
        " votes, position, margin, margin_percentage, turnout_percentage,"
        " enop, valid_votes, electors, n_cand, vote_share_percentage"
        " FROM tcpd_ae WHERE constituency_name = $1 AND position <= 2"
        " AND year = ANY($2)"
        " ORDER BY year, position",
        name, general_years,
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
async def state_swing(_user: dict = Depends(require_user)):
    pool = await get_pool()
    general_years = await _get_general_years(pool)
    rows = await pool.fetch("""
        WITH party_year AS (
            SELECT year, party,
                SUM(CASE WHEN position = 1 THEN 1 ELSE 0 END) AS seats_won,
                COUNT(DISTINCT constituency_no) AS total_seats,
                ROUND(AVG(vote_share_percentage)::numeric, 2) AS avg_vote_share,
                ROUND(AVG(CASE WHEN position = 1 THEN margin_percentage END)::numeric, 2) AS avg_margin
            FROM tcpd_ae
            WHERE year = ANY($1) AND party IS NOT NULL
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
    """, general_years)
    return [StateSwingSummary(**dict(r)) for r in rows]


# ---------------------------------------------------------------------------
# GET /swings/constituencies  — list all constituencies with their swing history
# ---------------------------------------------------------------------------
@router.get("/swings/constituencies", response_model=list[ConstituencySwingRow])
async def all_constituency_swings(_user: dict = Depends(require_user)):
    pool = await get_pool()
    general_years = await _get_general_years(pool)
    rows = await pool.fetch("""
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
        WHERE position <= 2 AND year = ANY($1)
        GROUP BY constituency_name, constituency_no, district_name,
            sub_region, constituency_type, year
        ORDER BY constituency_name, year
    """, general_years)
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# GET /predict/data  — full candidate breakdown for the last 2 elections
# ---------------------------------------------------------------------------


@router.get("/predict/data", response_model=PredictionDataResponse)
async def prediction_data(_user: dict = Depends(require_user)):
    pool = await get_pool()
    general_years = await _get_general_years(pool)

    # Use the last two election years dynamically
    if len(general_years) >= 2:
        latest_year, prev_year = general_years[-1], general_years[-2]
    elif len(general_years) == 1:
        latest_year, prev_year = general_years[0], general_years[0]
    else:
        latest_year, prev_year = 2021, 2016

    # Fetch all candidates for the last 2 elections
    rows = await pool.fetch("""
        SELECT year, constituency_name, constituency_no, constituency_type,
            district_name, sub_region, party, votes, vote_share_percentage,
            position, valid_votes, electors, turnout_percentage, enop, n_cand,
            candidate, margin, margin_percentage
        FROM tcpd_ae
        WHERE year IN ($1, $2)
        ORDER BY constituency_name, year, position
    """, latest_year, prev_year)

    # Group by constituency
    from collections import defaultdict
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

    return PredictionDataResponse(
        total_electors_next=total_electors_latest,  # estimate, same as latest
        total_electors_latest=total_electors_latest,
        latest_year=latest_year,
        prev_year=prev_year,
        constituency_count=len(constituencies),
        constituencies=constituencies,
    )
