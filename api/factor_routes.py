"""Factor metadata and ML prediction routes."""

import json
import os

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import ORJSONResponse

factor_router = APIRouter(prefix="/factors", tags=["factors"])

# ── Static factor catalog & coefficients ──────────────────
# Load once at import time from bundled JSON files.
_DATA_DIR = os.path.join(os.path.dirname(__file__), "factor_data")


def _load_json(filename: str) -> dict | list:
    path = os.path.join(_DATA_DIR, filename)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


_FACTOR_CATALOG: list[dict] = _load_json("factor_catalog.json")
_COEFFICIENTS: dict[str, dict] = _load_json("coefficients.json")
_ALLIANCE_DATA: dict[str, dict] = _load_json("alliance_data.json")


@factor_router.get("", response_class=ORJSONResponse)
async def get_factors():
    """Return the full factor catalog with metadata for all prediction factors."""
    return _FACTOR_CATALOG


@factor_router.get("/{state}", response_class=ORJSONResponse)
async def get_state_factors(state: str):
    """Return factor coefficients and alliance presets for a specific state.

    Falls back to national defaults if state-specific data is unavailable.
    """
    # Normalize state name: replace spaces/hyphens with underscores, title-case
    state_key = state.replace(" ", "_").replace("-", "_")

    coefficients = _COEFFICIENTS.get(state_key, _COEFFICIENTS.get("_national"))
    if coefficients is None:
        raise HTTPException(status_code=404, detail="No coefficient data available")

    alliances = _ALLIANCE_DATA.get(state_key)

    return {
        "state": state_key,
        "coefficients": coefficients,
        "alliances": alliances,
        "factors": _FACTOR_CATALOG,
    }
