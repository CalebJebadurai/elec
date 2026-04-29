"""Open Graph meta tag routes for social sharing previews."""

import html

from fastapi import APIRouter, Query
from fastapi.responses import HTMLResponse

from database import get_pool
from routes import _et_filter, _get_general_years

og_router = APIRouter(tags=["sharing"])

_OG_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">
<meta property="og:type" content="website">
<meta property="og:url" content="{url}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{description}">
<title>{title}</title>
<script>window.location.replace("{redirect}");</script>
</head>
<body><p>Redirecting to <a href="{redirect}">{title}</a>…</p></body>
</html>"""


def _og_html(title: str, description: str, url: str, redirect: str) -> HTMLResponse:
    content = _OG_TEMPLATE.format(
        title=html.escape(title),
        description=html.escape(description),
        url=html.escape(url),
        redirect=html.escape(redirect),
    )
    return HTMLResponse(content=content)


@og_router.get("/share/state/{state_name}/overview")
async def og_state_overview(state_name: str):
    display = state_name.replace("_", " ")
    pool = await get_pool()
    general_years = await _get_general_years(pool, state_name, "AE")
    year_range = f"{general_years[0]}–{general_years[-1]}" if general_years else ""
    count = await pool.fetchval(
        "SELECT COUNT(DISTINCT constituency_name) FROM tcpd_ae "
        "WHERE state_name = $1 AND election_type = 'State Assembly Election (AE)'",
        state_name,
    )
    desc = f"Assembly Elections {year_range} · {count or '—'} Constituencies"
    return _og_html(
        title=f"{display} Election Analysis",
        description=desc,
        url=f"/share/state/{state_name}/overview",
        redirect=f"/state/{state_name}/overview",
    )


@og_router.get("/share/state/{state_name}/constituencies/{name}")
async def og_constituency(state_name: str, name: str):
    display_state = state_name.replace("_", " ")
    display_name = name.replace("_", " ")
    return _og_html(
        title=f"{display_name} – {display_state}",
        description=f"Constituency swing history, vote share trends, and election results for {display_name}.",
        url=f"/share/state/{state_name}/constituencies/{name}",
        redirect=f"/state/{state_name}/constituencies/{name}",
    )


@og_router.get("/share/national")
async def og_national():
    return _og_html(
        title="National Election Dashboard – India",
        description="Cross-state election analysis: party strength, turnout trends, state comparisons, and upcoming elections across India.",
        url="/share/national",
        redirect="/national",
    )
