"""Bookmark and voting routes for saving/sharing predictions. Thanks Afrah for motivation!!!"""

import json

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator

from auth import get_current_user, require_user
from database import get_pool

bookmark_router = APIRouter()

# ── Request / Response Models ─────────────────────────────


class CreateBookmarkRequest(BaseModel):
    title: str
    description: str = ""
    params: dict
    is_public: bool = False

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 1 or len(v) > 100:
            raise ValueError("Title must be 1-100 characters")
        return v

    @field_validator("description")
    @classmethod
    def validate_description(cls, v: str) -> str:
        return v.strip()[:500]


class UpdateBookmarkRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    params: dict | None = None
    is_public: bool | None = None


class VoteRequest(BaseModel):
    vote_type: str

    @field_validator("vote_type")
    @classmethod
    def validate_vote_type(cls, v: str) -> str:
        if v not in ("like", "dislike"):
            raise ValueError("vote_type must be 'like' or 'dislike'")
        return v


# ── Bookmark CRUD ─────────────────────────────────────────


@bookmark_router.get("")
async def list_my_bookmarks(
    user: dict = Depends(require_user),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    """List bookmarks owned by the current user."""
    pool = await get_pool()
    user_id = int(user["sub"])
    rows = await pool.fetch(
        "SELECT b.*, u.display_name AS author_name "
        "FROM bookmarks b JOIN users u ON b.user_id = u.id "
        "WHERE b.user_id = $1 ORDER BY b.updated_at DESC "
        "LIMIT $2 OFFSET $3",
        user_id, limit, offset,
    )
    return [_bookmark_row(r) for r in rows]


@bookmark_router.get("/public")
async def list_public_bookmarks(
    sort: str = Query(default="recent", pattern="^(recent|popular)$"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: dict | None = Depends(get_current_user),
):
    """List all public bookmarks, optionally with the current user's vote."""
    pool = await get_pool()

    order = "b.created_at DESC" if sort == "recent" else "b.like_count DESC"
    user_id = int(user["sub"]) if user else None

    if user_id:
        # Single query with LEFT JOIN to get user's vote — no N+1
        rows = await pool.fetch(
            f"SELECT b.*, u.display_name AS author_name, u.avatar_url AS author_avatar, "
            f"v.vote_type AS my_vote "
            f"FROM bookmarks b JOIN users u ON b.user_id = u.id "
            f"LEFT JOIN votes v ON v.bookmark_id = b.id AND v.user_id = $3 "
            f"WHERE b.is_public = true ORDER BY {order} "
            f"LIMIT $1 OFFSET $2",
            limit, offset, user_id,
        )
    else:
        rows = await pool.fetch(
            f"SELECT b.*, u.display_name AS author_name, u.avatar_url AS author_avatar "
            f"FROM bookmarks b JOIN users u ON b.user_id = u.id "
            f"WHERE b.is_public = true ORDER BY {order} "
            f"LIMIT $1 OFFSET $2",
            limit, offset,
        )

    results = []
    for r in rows:
        item = _bookmark_row(r)
        if user_id:
            item["my_vote"] = r.get("my_vote")
        results.append(item)

    return results


@bookmark_router.get("/{bookmark_id}")
async def get_bookmark(
    bookmark_id: int,
    user: dict | None = Depends(get_current_user),
):
    """Get a single bookmark by ID (public ones visible to all; private only to owner)."""
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT b.*, u.display_name AS author_name, u.avatar_url AS author_avatar "
        "FROM bookmarks b JOIN users u ON b.user_id = u.id "
        "WHERE b.id = $1",
        bookmark_id,
    )
    if row is None:
        raise HTTPException(404, "Bookmark not found")

    user_id = int(user["sub"]) if user else None

    if not row["is_public"] and (user_id is None or user_id != row["user_id"]):
        raise HTTPException(404, "Bookmark not found")

    result = _bookmark_row(row)
    if user_id:
        vote = await pool.fetchval(
            "SELECT vote_type FROM votes WHERE user_id = $1 AND bookmark_id = $2",
            user_id, bookmark_id,
        )
        result["my_vote"] = vote
    return result


@bookmark_router.post("", status_code=201)
async def create_bookmark(
    body: CreateBookmarkRequest,
    user: dict = Depends(require_user),
):
    """Create a new bookmark with prediction parameters."""
    pool = await get_pool()
    user_id = int(user["sub"])

    # Limit bookmarks per user
    count = await pool.fetchval(
        "SELECT COUNT(*) FROM bookmarks WHERE user_id = $1", user_id
    )
    if count >= 50:
        raise HTTPException(400, "Maximum 50 bookmarks per user")

    row = await pool.fetchrow(
        "INSERT INTO bookmarks (user_id, title, description, params, is_public) "
        "VALUES ($1, $2, $3, $4, $5) RETURNING *",
        user_id,
        body.title,
        body.description,
        json.dumps(body.params),
        body.is_public,
    )
    return _bookmark_row(row)


@bookmark_router.put("/{bookmark_id}")
async def update_bookmark(
    bookmark_id: int,
    body: UpdateBookmarkRequest,
    user: dict = Depends(require_user),
):
    """Update a bookmark owned by the current user."""
    pool = await get_pool()
    user_id = int(user["sub"])

    existing = await pool.fetchrow(
        "SELECT * FROM bookmarks WHERE id = $1 AND user_id = $2",
        bookmark_id, user_id,
    )
    if existing is None:
        raise HTTPException(404, "Bookmark not found")

    updates = []
    params = []
    idx = 1
    if body.title is not None:
        updates.append(f"title = ${idx}")
        params.append(body.title.strip()[:100])
        idx += 1
    if body.description is not None:
        updates.append(f"description = ${idx}")
        params.append(body.description.strip()[:500])
        idx += 1
    if body.params is not None:
        updates.append(f"params = ${idx}")
        params.append(json.dumps(body.params))
        idx += 1
    if body.is_public is not None:
        updates.append(f"is_public = ${idx}")
        params.append(body.is_public)
        idx += 1

    if not updates:
        return _bookmark_row(existing)

    updates.append("updated_at = now()")
    params.extend([bookmark_id, user_id])

    row = await pool.fetchrow(
        f"UPDATE bookmarks SET {', '.join(updates)} "
        f"WHERE id = ${idx} AND user_id = ${idx + 1} RETURNING *",
        *params,
    )
    return _bookmark_row(row)


@bookmark_router.delete("/{bookmark_id}", status_code=204)
async def delete_bookmark(
    bookmark_id: int,
    user: dict = Depends(require_user),
):
    """Delete a bookmark owned by the current user."""
    pool = await get_pool()
    user_id = int(user["sub"])
    result = await pool.execute(
        "DELETE FROM bookmarks WHERE id = $1 AND user_id = $2",
        bookmark_id, user_id,
    )
    if result == "DELETE 0":
        raise HTTPException(404, "Bookmark not found")


# ── Voting ────────────────────────────────────────────────


@bookmark_router.post("/{bookmark_id}/vote")
async def vote_bookmark(
    bookmark_id: int,
    body: VoteRequest,
    user: dict = Depends(require_user),
):
    """Like or dislike a public bookmark. Toggle off by voting the same type again."""
    pool = await get_pool()
    user_id = int(user["sub"])

    # Verify bookmark exists and is public
    bookmark = await pool.fetchrow(
        "SELECT id, user_id, is_public FROM bookmarks WHERE id = $1",
        bookmark_id,
    )
    if bookmark is None or not bookmark["is_public"]:
        raise HTTPException(404, "Bookmark not found")

    # Don't allow voting on own bookmark
    if bookmark["user_id"] == user_id:
        raise HTTPException(400, "Cannot vote on your own bookmark")

    # Check existing vote
    existing = await pool.fetchrow(
        "SELECT id, vote_type FROM votes WHERE user_id = $1 AND bookmark_id = $2",
        user_id, bookmark_id,
    )

    async with pool.acquire() as conn:
        async with conn.transaction():
            if existing is None:
                # New vote
                await conn.execute(
                    "INSERT INTO votes (user_id, bookmark_id, vote_type) VALUES ($1, $2, $3)",
                    user_id, bookmark_id, body.vote_type,
                )
                col = "like_count" if body.vote_type == "like" else "dislike_count"
                updated = await conn.fetchrow(
                    f"UPDATE bookmarks SET {col} = {col} + 1 WHERE id = $1 "
                    f"RETURNING like_count, dislike_count",
                    bookmark_id,
                )
                current_vote = body.vote_type
            elif existing["vote_type"] == body.vote_type:
                # Same vote type → remove (toggle off)
                await conn.execute("DELETE FROM votes WHERE id = $1", existing["id"])
                col = "like_count" if body.vote_type == "like" else "dislike_count"
                updated = await conn.fetchrow(
                    f"UPDATE bookmarks SET {col} = GREATEST({col} - 1, 0) WHERE id = $1 "
                    f"RETURNING like_count, dislike_count",
                    bookmark_id,
                )
                current_vote = None
            else:
                # Switch vote
                old_col = "like_count" if existing["vote_type"] == "like" else "dislike_count"
                new_col = "like_count" if body.vote_type == "like" else "dislike_count"
                await conn.execute(
                    "UPDATE votes SET vote_type = $1 WHERE id = $2",
                    body.vote_type, existing["id"],
                )
                updated = await conn.fetchrow(
                    f"UPDATE bookmarks SET {old_col} = GREATEST({old_col} - 1, 0), "
                    f"{new_col} = {new_col} + 1 WHERE id = $1 "
                    f"RETURNING like_count, dislike_count",
                    bookmark_id,
                )
                current_vote = body.vote_type

    return {
        "like_count": updated["like_count"],
        "dislike_count": updated["dislike_count"],
        "my_vote": current_vote,
    }


# ── Helpers ───────────────────────────────────────────────


def _bookmark_row(row) -> dict:
    d = dict(row)
    # Parse JSONB params if it's a string
    if isinstance(d.get("params"), str):
        d["params"] = json.loads(d["params"])
    # Convert timestamps to ISO strings
    for key in ("created_at", "updated_at"):
        if key in d and d[key] is not None:
            d[key] = d[key].isoformat()
    return d
