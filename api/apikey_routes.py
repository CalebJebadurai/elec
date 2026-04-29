"""API key generation, listing, and revocation — Pro tier only."""

import secrets

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from auth import require_tier
from database import get_pool
from models import ApiKeyOut, ApiKeyCreated

apikey_router = APIRouter(prefix="/api-keys", tags=["api-keys"])


class CreateKeyRequest(BaseModel):
    label: str | None = None


@apikey_router.post("", response_model=ApiKeyCreated, status_code=201)
async def create_api_key(body: CreateKeyRequest, user: dict = Depends(require_tier("pro"))):
    pool = await get_pool()
    user_id = int(user["sub"])

    # Check key limit (max 5 active keys)
    count = await pool.fetchval(
        "SELECT COUNT(*) FROM api_keys WHERE user_id = $1 AND is_active = TRUE", user_id
    )
    if count >= 5:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Maximum 5 active API keys allowed")

    # Generate key: elk_live_ + 40 random chars
    raw_key = "elk_live_" + secrets.token_urlsafe(30)
    prefix = raw_key[:16]
    key_hash = bcrypt.hashpw(raw_key.encode(), bcrypt.gensalt()).decode()

    row = await pool.fetchrow(
        """INSERT INTO api_keys (user_id, key_hash, key_prefix, label)
           VALUES ($1, $2, $3, $4) RETURNING id""",
        user_id, key_hash, prefix, body.label,
    )
    return ApiKeyCreated(id=row["id"], key=raw_key, key_prefix=prefix, label=body.label)


@apikey_router.get("", response_model=list[ApiKeyOut])
async def list_api_keys(user: dict = Depends(require_tier("pro"))):
    pool = await get_pool()
    rows = await pool.fetch(
        """SELECT id, key_prefix, label, created_at, last_used_at, is_active
           FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC""",
        int(user["sub"]),
    )
    return [dict(r) for r in rows]


@apikey_router.delete("/{key_id}", status_code=204)
async def revoke_api_key(key_id: int, user: dict = Depends(require_tier("pro"))):
    pool = await get_pool()
    result = await pool.execute(
        "UPDATE api_keys SET is_active = FALSE, revoked_at = NOW() WHERE id = $1 AND user_id = $2",
        key_id, int(user["sub"]),
    )
    if result == "UPDATE 0":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "API key not found")
