"""Tests for the data routes in routes.py.

These tests verify route registration and auth requirements.
Full integration tests requiring a database belong in a separate test file.
"""

import pytest


@pytest.mark.anyio
async def test_stats_summary_allows_anonymous(client):
    """Stats summary is a public endpoint (no auth required)."""
    response = await client.get("/stats/summary?state=Tamil_Nadu&election_type=AE")
    # Should not be 401 — it's now a public endpoint
    assert response.status_code != 401


@pytest.mark.anyio
async def test_elections_allows_anonymous(client):
    """Elections endpoint allows anonymous access."""
    response = await client.get("/elections?state=Tamil_Nadu")
    assert response.status_code != 401


@pytest.mark.anyio
async def test_years_allows_anonymous(client):
    """Years endpoint allows anonymous access."""
    response = await client.get("/years?state=Tamil_Nadu")
    assert response.status_code != 401


@pytest.mark.anyio
async def test_parties_allows_anonymous(client):
    """Parties endpoint allows anonymous access."""
    response = await client.get("/parties?state=Tamil_Nadu")
    assert response.status_code != 401


@pytest.mark.anyio
async def test_constituencies_allows_anonymous(client):
    """Constituencies endpoint allows anonymous access."""
    response = await client.get("/constituencies?state=Tamil_Nadu")
    assert response.status_code != 401


@pytest.mark.anyio
async def test_districts_allows_anonymous(client):
    """Districts endpoint allows anonymous access."""
    response = await client.get("/districts?state=Tamil_Nadu")
    assert response.status_code != 401


@pytest.mark.anyio
async def test_prediction_data_requires_auth(client):
    """Prediction data endpoint still requires authentication."""
    response = await client.get("/predict/data?state=Tamil_Nadu")
    assert response.status_code == 401


@pytest.mark.anyio
async def test_states_does_not_require_auth(client):
    """States list endpoint should not require authentication (public)."""
    response = await client.get("/states")
    assert response.status_code != 401


@pytest.mark.anyio
async def test_constituency_swing_allows_anonymous(client):
    """Constituency swing endpoint allows anonymous access."""
    response = await client.get("/swings/constituency/Test?state=Tamil_Nadu")
    assert response.status_code != 401


@pytest.mark.anyio
async def test_state_swing_allows_anonymous(client):
    """State swing endpoint allows anonymous access."""
    response = await client.get("/swings/state?state=Tamil_Nadu")
    assert response.status_code != 401
