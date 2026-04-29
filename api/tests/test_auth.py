"""Tests for authentication module (auth.py)."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
import jwt as pyjwt
from datetime import datetime, timedelta, timezone

from auth import create_token, decode_token, JWT_SECRET, JWT_ALGORITHM, JWT_AUDIENCE


class TestCreateToken:
    def test_creates_valid_jwt(self):
        token = create_token(user_id=42, role="user")
        assert isinstance(token, str)
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM], audience=JWT_AUDIENCE)
        assert payload["sub"] == "42"
        assert payload["role"] == "user"
        assert payload["aud"] == JWT_AUDIENCE

    def test_admin_role(self):
        token = create_token(user_id=1, role="admin")
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM], audience=JWT_AUDIENCE)
        assert payload["role"] == "admin"

    def test_token_has_expiry(self):
        token = create_token(user_id=1)
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM], audience=JWT_AUDIENCE)
        assert "exp" in payload
        assert "iat" in payload
        exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        assert exp > datetime.now(timezone.utc)


class TestDecodeToken:
    def test_decodes_valid_token(self):
        token = create_token(user_id=7, role="user")
        payload = decode_token(token)
        assert payload["sub"] == "7"
        assert payload["role"] == "user"

    def test_rejects_expired_token(self):
        payload = {
            "sub": "1",
            "role": "user",
            "aud": JWT_AUDIENCE,
            "exp": datetime.now(timezone.utc) - timedelta(hours=1),
            "iat": datetime.now(timezone.utc) - timedelta(hours=2),
        }
        token = pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            decode_token(token)
        assert exc_info.value.status_code == 401

    def test_rejects_invalid_token(self):
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            decode_token("not.a.valid.token")
        assert exc_info.value.status_code == 401

    def test_rejects_wrong_secret(self):
        payload = {
            "sub": "1",
            "role": "user",
            "aud": JWT_AUDIENCE,
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
            "iat": datetime.now(timezone.utc),
        }
        token = pyjwt.encode(payload, "wrong-secret", algorithm=JWT_ALGORITHM)
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            decode_token(token)
        assert exc_info.value.status_code == 401

    def test_rejects_wrong_audience(self):
        payload = {
            "sub": "1",
            "role": "user",
            "aud": "wrong-audience",
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
            "iat": datetime.now(timezone.utc),
        }
        token = pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            decode_token(token)
        assert exc_info.value.status_code == 401
