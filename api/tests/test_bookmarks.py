"""Tests for bookmark routes auth requirements."""

import pytest


@pytest.mark.anyio
async def test_list_bookmarks_requires_auth(client):
    """Bookmark list endpoint requires authentication."""
    response = await client.get("/bookmarks")
    assert response.status_code == 401


@pytest.mark.anyio
async def test_create_bookmark_requires_auth(client):
    """Bookmark creation requires authentication."""
    response = await client.post("/bookmarks", json={
        "title": "Test",
        "params": {"test": True},
    })
    assert response.status_code == 401


@pytest.mark.anyio
async def test_public_bookmarks_allows_anonymous(client):
    """Public bookmarks list should allow anonymous access."""
    response = await client.get("/bookmarks/public")
    # Should not be 401 — public endpoint allows anonymous
    assert response.status_code != 401


# ── Bookmark params validation tests (Phase 2.9 hardening) ──


@pytest.mark.anyio
async def test_bookmark_rejects_out_of_range_factor(client, auth_headers):
    """Bookmark creation rejects out-of-range prediction factor values."""
    response = await client.post(
        "/v1/bookmarks",
        json={
            "title": "Bad params",
            "params": {"turnoutPct": 150},  # out of range [0, 100]
        },
        headers=auth_headers,
    )
    assert response.status_code == 422


@pytest.mark.anyio
async def test_bookmark_rejects_invalid_prediction_mode(client, auth_headers):
    """Bookmark creation rejects invalid predictionMode."""
    response = await client.post(
        "/v1/bookmarks",
        json={
            "title": "Bad mode",
            "params": {"predictionMode": "invalid"},
        },
        headers=auth_headers,
    )
    assert response.status_code == 422


@pytest.mark.anyio
async def test_bookmark_rejects_invalid_alliance_config(client, auth_headers):
    """Bookmark creation rejects invalid allianceConfig structure."""
    response = await client.post(
        "/v1/bookmarks",
        json={
            "title": "Bad alliance",
            "params": {
                "allianceConfig": [
                    {"name": "NDA", "parties": ["BJP", "JDU"], "transferEfficiency": 2.0}
                ]
            },
        },
        headers=auth_headers,
    )
    assert response.status_code == 422


@pytest.mark.anyio
async def test_bookmark_accepts_valid_multifactor_params(client, auth_headers):
    """Bookmark creation accepts valid multi-factor prediction params."""
    response = await client.post(
        "/v1/bookmarks",
        json={
            "title": "Valid multi-factor",
            "params": {
                "antiIncumbencyPct": 30,
                "turnoutPct": 72,
                "turnoutChange": 5,
                "incumbencyFatigue": 20,
                "predictionMode": "formula",
                "allianceConfig": [
                    {"name": "NDA", "parties": ["BJP", "JDU"], "transferEfficiency": 0.85}
                ],
            },
        },
        headers=auth_headers,
    )
    # May fail with DB error (no live DB), but should not be 422 (validation)
    assert response.status_code != 422


@pytest.mark.anyio
async def test_bookmark_accepts_old_three_param_schema(client, auth_headers):
    """Bookmark creation accepts the old three-parameter schema (backward compat)."""
    response = await client.post(
        "/v1/bookmarks",
        json={
            "title": "Old bookmark",
            "params": {
                "antiIncumbencyPct": 15,
                "turnoutPct": 68,
                "newPartyName": "AAP",
            },
        },
        headers=auth_headers,
    )
    # Should not be rejected as invalid
    assert response.status_code != 422
