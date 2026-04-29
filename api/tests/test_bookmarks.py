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
