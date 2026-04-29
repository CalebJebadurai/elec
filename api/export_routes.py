"""CSV export endpoint — Pro tier only."""

import csv
import io
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from auth import require_tier
from database import get_pool

export_router = APIRouter(prefix="/export", tags=["export"])

_EXPORT_COLUMNS = [
    "state_name", "year", "assembly_no", "constituency_no", "constituency_name",
    "district_name", "sub_region", "constituency_type", "poll_no", "position",
    "candidate", "sex", "age", "party", "votes", "turnout_percentage",
    "vote_share_percentage", "deposit_lost", "margin", "margin_percentage",
    "enots", "pid", "is_turncoat", "recontest", "last_party",
]


async def _stream_csv(state: str, election_type: str, year: int | None) -> AsyncGenerator[str, None]:
    pool = await get_pool()
    et_filter = "General Election" if election_type == "GE" else "State Assembly Election (AE)"

    query = "SELECT * FROM tcpd_ae WHERE state_name = $1 AND election_type = $2"
    params: list = [state, et_filter]
    if year:
        query += " AND year = $3"
        params.append(year)
    query += " ORDER BY year, constituency_no, position"

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(_EXPORT_COLUMNS)
    yield buf.getvalue()
    buf.seek(0)
    buf.truncate()

    async with pool.acquire() as conn:
        async with conn.transaction():
            async for record in conn.cursor(query, *params):
                row = [record.get(col, "") for col in _EXPORT_COLUMNS]
                writer.writerow(row)
                yield buf.getvalue()
                buf.seek(0)
                buf.truncate()


@export_router.get("/csv")
async def export_csv(
    state: str = Query(...),
    election_type: str = Query("AE"),
    year: int | None = Query(None),
    user: dict = Depends(require_tier("pro")),
):
    filename = f"election_data_{state}_{election_type}"
    if year:
        filename += f"_{year}"
    filename += ".csv"

    return StreamingResponse(
        _stream_csv(state, election_type, year),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
