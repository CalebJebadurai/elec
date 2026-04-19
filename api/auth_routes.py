"""Authentication routes: mobile OTP and Google account linking."""

import os
import re
import time as _time

import httpx
import jwt as pyjwt

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from auth import create_token, require_user
from database import get_pool

auth_router = APIRouter()

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")

# ── Firebase public key cache ─────────────────────────────
_firebase_keys_cache: dict | None = None
_firebase_keys_expiry: float = 0


async def _get_firebase_public_keys() -> dict:
    """Fetch and cache Google's Firebase public keys (TTL from Cache-Control)."""
    global _firebase_keys_cache, _firebase_keys_expiry
    if _firebase_keys_cache and _time.time() < _firebase_keys_expiry:
        return _firebase_keys_cache

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
        )
    if resp.status_code != 200:
        raise HTTPException(502, "Failed to fetch Firebase public keys")

    # Parse max-age from Cache-Control header
    cc = resp.headers.get("cache-control", "")
    max_age = 3600  # default 1 hour
    for part in cc.split(","):
        part = part.strip()
        if part.startswith("max-age="):
            try:
                max_age = int(part.split("=")[1])
            except ValueError:
                pass

    _firebase_keys_cache = resp.json()
    _firebase_keys_expiry = _time.time() + max_age
    return _firebase_keys_cache

# ── Request / Response Models ─────────────────────────────


class SendOTPRequest(BaseModel):
    mobile: str

    @field_validator("mobile")
    @classmethod
    def validate_mobile(cls, v: str) -> str:
        cleaned = re.sub(r"[\s\-]", "", v)
        if not re.match(r"^\+?\d{10,15}$", cleaned):
            raise ValueError("Invalid mobile number")
        return cleaned


class VerifyOTPRequest(BaseModel):
    mobile: str
    firebase_id_token: str  # verified client-side via Firebase Auth

    @field_validator("mobile")
    @classmethod
    def validate_mobile(cls, v: str) -> str:
        cleaned = re.sub(r"[\s\-]", "", v)
        if not re.match(r"^\+?\d{10,15}$", cleaned):
            raise ValueError("Invalid mobile number")
        return cleaned


class GoogleLinkRequest(BaseModel):
    google_id_token: str
    google_access_token: str | None = None


class AuthResponse(BaseModel):
    token: str
    user: dict


class UserProfile(BaseModel):
    display_name: str | None = None


# ── Routes ────────────────────────────────────────────────


@auth_router.post("/verify-otp", response_model=AuthResponse)
async def verify_otp(body: VerifyOTPRequest):
    """
    Verify Firebase ID token (phone auth) and create/login user.

    The client authenticates with Firebase Phone Auth, obtains an ID token,
    and sends it here. We verify it server-side and issue our own JWT.
    """
    # Verify Firebase ID token
    phone = await _verify_firebase_phone_token(body.firebase_id_token, body.mobile)

    pool = await get_pool()

    # Upsert user
    row = await pool.fetchrow(
        "SELECT id, mobile, display_name, google_email, role, avatar_url "
        "FROM users WHERE mobile = $1",
        phone,
    )
    if row is None:
        row = await pool.fetchrow(
            "INSERT INTO users (mobile) VALUES ($1) "
            "RETURNING id, mobile, display_name, google_email, role, avatar_url",
            phone,
        )

    user = dict(row)
    token = create_token(user["id"], user["role"])
    return AuthResponse(token=token, user=user)


@auth_router.post("/google-link")
async def link_google(body: GoogleLinkRequest, user: dict = Depends(require_user)):
    """Link a Google account to the authenticated user."""
    google_info = await _verify_google_from_firebase(body.google_id_token)

    # Fetch birthday from Google People API if access token provided
    date_of_birth = None
    if body.google_access_token:
        date_of_birth = await _fetch_google_birthday(body.google_access_token)

    pool = await get_pool()
    user_id = int(user["sub"])

    # Check if Google ID is already linked to another account
    existing = await pool.fetchval(
        "SELECT id FROM users WHERE google_id = $1 AND id != $2",
        google_info["google_id"],
        user_id,
    )
    if existing:
        raise HTTPException(409, "This Google account is linked to another user")

    await pool.execute(
        "UPDATE users SET google_id = $1, google_email = $2, "
        "avatar_url = COALESCE(avatar_url, $3), date_of_birth = COALESCE($4, date_of_birth), "
        "updated_at = now() WHERE id = $5",
        google_info["google_id"],
        google_info.get("email"),
        google_info.get("picture"),
        date_of_birth,
        user_id,
    )
    return {"ok": True}


@auth_router.get("/me")
async def get_me(user: dict = Depends(require_user)):
    """Get current user profile."""
    from datetime import date

    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT id, mobile, display_name, google_email, role, avatar_url, date_of_birth "
        "FROM users WHERE id = $1",
        int(user["sub"]),
    )
    if row is None:
        raise HTTPException(404, "User not found")
    result = dict(row)
    dob = result.get("date_of_birth")
    if dob:
        today = date.today()
        result["age"] = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
        result["date_of_birth"] = dob.isoformat()
    else:
        result["age"] = None
    return result


@auth_router.put("/me")
async def update_me(body: UserProfile, user: dict = Depends(require_user)):
    """Update display name."""
    pool = await get_pool()
    if body.display_name:
        name = body.display_name.strip()[:50]  # Limit length
        await pool.execute(
            "UPDATE users SET display_name = $1, updated_at = now() WHERE id = $2",
            name,
            int(user["sub"]),
        )
    return {"ok": True}


# ── Token Verification Helpers ────────────────────────────


async def _fetch_google_birthday(access_token: str):
    """Fetch the user's birthday from Google People API. Returns a date or None."""
    from datetime import date

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://people.googleapis.com/v1/people/me",
                params={"personFields": "birthdays"},
                headers={"Authorization": f"Bearer {access_token}"},
            )
        if resp.status_code != 200:
            return None
        data = resp.json()
        for bday in data.get("birthdays", []):
            d = bday.get("date", {})
            if d.get("year") and d.get("month") and d.get("day"):
                return date(d["year"], d["month"], d["day"])
    except Exception:
        pass
    return None


async def _verify_firebase_phone_token(id_token: str, expected_phone: str) -> str:
    """
    Verify a Firebase ID token and extract the phone number.
    Uses Google's secure token verification endpoint for Firebase tokens.
    """
    # Firebase ID tokens must be verified via the securetoken endpoint
    FIREBASE_PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID", "elec-auth")

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            f"https://www.googleapis.com/identitytoolkit/v3/relyingparty/getAccountInfo?key={os.environ.get('FIREBASE_API_KEY', '')}",
            json={"idToken": id_token},
        )

    # If the API key approach fails, fall back to verifying the JWT directly
    if resp.status_code != 200:
        # Try verifying as a standard Firebase JWT
        phone = await _verify_firebase_jwt(id_token, FIREBASE_PROJECT_ID)
    else:
        data = resp.json()
        users = data.get("users", [])
        if not users:
            raise HTTPException(401, "Invalid Firebase token — no user found")
        user_info = users[0]
        phone = user_info.get("phoneNumber", "")

    # Normalize both for comparison
    clean_expected = re.sub(r"[\s\-]", "", expected_phone)
    clean_phone = re.sub(r"[\s\-]", "", phone)

    if not clean_phone or not clean_phone.endswith(clean_expected[-10:]):
        raise HTTPException(401, "Phone number mismatch")

    return clean_phone


async def _verify_firebase_jwt(id_token: str, project_id: str) -> str:
    """
    Verify Firebase ID token by decoding the JWT and checking its claims.
    Uses cached Google public keys to verify the signature.
    """
    public_keys = await _get_firebase_public_keys()

    # Decode header to find the key ID
    try:
        header = pyjwt.get_unverified_header(id_token)
    except Exception:
        raise HTTPException(401, "Invalid Firebase token format")

    kid = header.get("kid")
    if kid not in public_keys:
        raise HTTPException(401, "Firebase token key ID not found")

    # Load the X.509 certificate
    from cryptography.x509 import load_pem_x509_certificate

    cert = load_pem_x509_certificate(public_keys[kid].encode())
    public_key = cert.public_key()

    try:
        payload = pyjwt.decode(
            id_token,
            public_key,
            algorithms=["RS256"],
            audience=project_id,
            issuer=f"https://securetoken.google.com/{project_id}",
        )
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(401, "Firebase token expired")
    except pyjwt.InvalidTokenError as e:
        raise HTTPException(401, f"Invalid Firebase token: {e}")

    phone = payload.get("phone_number", "")
    if not phone:
        raise HTTPException(401, "No phone number in Firebase token")

    return phone


async def _verify_google_from_firebase(id_token: str) -> dict:
    """
    Verify a Firebase ID token from signInWithPopup(Google) and extract Google info.
    The Firebase token contains the Google provider data in the 'firebase' claim.
    """
    FIREBASE_PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID", "elec-auth")

    # First try the Identity Toolkit API
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            f"https://www.googleapis.com/identitytoolkit/v3/relyingparty/getAccountInfo"
            f"?key={os.environ.get('FIREBASE_API_KEY', '')}",
            json={"idToken": id_token},
        )

    if resp.status_code == 200:
        data = resp.json()
        users = data.get("users", [])
        if not users:
            raise HTTPException(401, "Invalid Firebase token — no user found")
        user_info = users[0]

        # Extract Google provider info
        google_id = None
        email = user_info.get("email")
        picture = user_info.get("photoUrl")
        for provider in user_info.get("providerUserInfo", []):
            if provider.get("providerId") == "google.com":
                google_id = provider.get("rawId")
                email = email or provider.get("email")
                picture = picture or provider.get("photoUrl")
                break

        if not google_id:
            raise HTTPException(400, "No Google provider found in this account")

        return {"google_id": google_id, "email": email, "picture": picture}

    # Fallback: verify Firebase JWT with signature check
    try:
        public_keys = await _get_firebase_public_keys()
        header = pyjwt.get_unverified_header(id_token)
        kid = header.get("kid")
        if kid not in public_keys:
            raise HTTPException(401, "Firebase token key ID not found")

        from cryptography.x509 import load_pem_x509_certificate
        cert = load_pem_x509_certificate(public_keys[kid].encode())
        public_key = cert.public_key()

        payload = pyjwt.decode(
            id_token,
            public_key,
            algorithms=["RS256"],
            audience=FIREBASE_PROJECT_ID,
            issuer=f"https://securetoken.google.com/{FIREBASE_PROJECT_ID}",
        )
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(401, "Invalid Firebase token")

    firebase_claim = payload.get("firebase", {})
    identities = firebase_claim.get("identities", {})
    google_ids = identities.get("google.com", [])

    if not google_ids:
        raise HTTPException(400, "No Google identity in Firebase token")

    return {
        "google_id": google_ids[0],
        "email": payload.get("email"),
        "picture": payload.get("picture"),
    }
