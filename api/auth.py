"""JWT helper utilities for authentication."""

import os
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from database import get_pool

JWT_SECRET = os.environ.get("JWT_SECRET", "")
if not JWT_SECRET or JWT_SECRET in ("change-me", "change_me_to_a_random_64_char_string"):
    raise RuntimeError(
        "FATAL: JWT_SECRET is not set or is using a default placeholder. "
        "Set a strong random secret in your .env file."
    )
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
JWT_EXPIRY_HOURS = int(os.environ.get("JWT_EXPIRY_HOURS", "24"))
JWT_AUDIENCE = "elec-api"

# Cookie configuration
COOKIE_NAME = "auth_token"
CSRF_COOKIE_NAME = "csrf_token"
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "true").lower() not in ("false", "0", "no")
COOKIE_SAMESITE = os.environ.get("COOKIE_SAMESITE", "lax")

_bearer = HTTPBearer(auto_error=False)


def create_token(user_id: int, role: str = "user") -> str:
    payload = {
        "sub": str(user_id),
        "role": role,
        "aud": JWT_AUDIENCE,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM], audience=JWT_AUDIENCE)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")


def set_auth_cookies(response: Response, token: str) -> str:
    """Set httpOnly JWT cookie and non-httpOnly CSRF cookie. Returns the CSRF token."""
    csrf_token = secrets.token_urlsafe(32)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=JWT_EXPIRY_HOURS * 3600,
        path="/",
    )
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=csrf_token,
        httponly=False,  # Must be readable by JavaScript for CSRF header
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=JWT_EXPIRY_HOURS * 3600,
        path="/",
    )
    return csrf_token


def clear_auth_cookies(response: Response) -> None:
    """Clear auth and CSRF cookies."""
    response.delete_cookie(key=COOKIE_NAME, path="/")
    response.delete_cookie(key=CSRF_COOKIE_NAME, path="/")


_API_KEY_PREFIX = "elk_live_"


async def _authenticate_api_key(key: str) -> dict:
    """Verify an API key (elk_live_...) against stored bcrypt hashes."""
    if not key.startswith(_API_KEY_PREFIX):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
    prefix = key[:16]
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT id, user_id, key_hash FROM api_keys WHERE key_prefix = $1 AND is_active = TRUE",
        prefix,
    )
    for row in rows:
        if bcrypt.checkpw(key.encode(), row["key_hash"].encode()):
            await pool.execute(
                "UPDATE api_keys SET last_used_at = NOW() WHERE id = $1", row["id"]
            )
            user = await pool.fetchrow("SELECT id, role, tier FROM users WHERE id = $1", row["user_id"])
            if not user:
                raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
            return {"sub": str(user["id"]), "role": user["role"], "tier": user.get("tier", "free"), "api_key_id": row["id"]}
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid API key")


async def get_current_user(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict | None:
    """Return decoded JWT payload or None for unauthenticated requests.

    Checks (in order):
    1. Authorization: Bearer elk_live_... (API key)
    2. Authorization: Bearer <jwt> header
    3. auth_token httpOnly cookie
    """
    if creds is not None:
        token = creds.credentials
        if token.startswith(_API_KEY_PREFIX):
            return await _authenticate_api_key(token)
        return decode_token(token)
    # Fall back to cookie
    cookie_token = request.cookies.get(COOKIE_NAME)
    if cookie_token:
        return decode_token(cookie_token)
    return None


async def require_user(
    user: dict | None = Depends(get_current_user),
) -> dict:
    """Require authentication — raises 401 if not logged in."""
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Login required")
    return user


_TIER_LEVEL = {"free": 0, "pro": 1, "business": 2, "enterprise": 3}


def require_tier(minimum: str):
    """Dependency factory: require user to have at least *minimum* tier."""
    min_level = _TIER_LEVEL[minimum]

    async def _check(user: dict = Depends(require_user)) -> dict:
        # Tier may come from API key auth (already resolved) or JWT (needs DB lookup)
        tier = user.get("tier")
        if tier is None:
            pool = await get_pool()
            row = await pool.fetchrow("SELECT tier FROM users WHERE id = $1", int(user["sub"]))
            tier = row["tier"] if row else "free"
        if _TIER_LEVEL.get(tier, 0) < min_level:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"This feature requires a {minimum} subscription. Upgrade at /pricing",
            )
        user["tier"] = tier
        return user

    return _check
