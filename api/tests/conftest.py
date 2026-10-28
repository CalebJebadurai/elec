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


@pytest.fixture(scope="session")
async def app():
    """The FastAPI app with its startup run once, as in production.

    Startup creates the tables (tcpd_ae, users, bookmarks, ...) in the test
    database; ASGITransport alone never runs it.
    """
    from database import get_pool
    from main import app as fastapi_app
    async with fastapi_app.router.lifespan_context(fastapi_app):
        # The user behind auth_headers / admin_headers (user_id=1), so their writes have an owner.
        pool = await get_pool()
        await pool.execute(
            "INSERT INTO users (id, mobile) VALUES (1, '+910000000001') ON CONFLICT (id) DO NOTHING"
        )
        yield fastapi_app


@pytest.fixture()
async def client(app):
    """Async HTTP test client that talks to the FastAPI app."""
    transport = ASGITransport(app=app)
    # Behave like the frontend: send the double-submit CSRF cookie and header on every request.
    csrf = "test-csrf-token"
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        cookies={"csrf_token": csrf},
        headers={"X-CSRF-Token": csrf},
    ) as ac:
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
