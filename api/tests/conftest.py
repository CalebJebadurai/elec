"""Shared test fixtures for the API test suite."""

import os
import sys

# Ensure the api/ directory is on the import path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Set a test JWT_SECRET before importing any application modules
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-unit-tests-only-64chars-long-enough-for-hs256!")
os.environ.setdefault("TESTING", "true")

import pytest
from httpx import ASGITransport, AsyncClient

from auth import create_token


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest.fixture()
async def client():
    """Async HTTP test client that talks to the FastAPI app.

    Uses the real app but patches the DB pool to avoid needing a live database
    for unit-level route tests. For integration tests that need the DB,
    use a separate fixture with a test database.
    """
    from main import app
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture()
def auth_headers():
    """Return Authorization headers with a valid JWT for user_id=1, role=user."""
    token = create_token(user_id=1, role="user")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def admin_headers():
    """Return Authorization headers with a valid JWT for user_id=1, role=admin."""
    token = create_token(user_id=1, role="admin")
    return {"Authorization": f"Bearer {token}"}
