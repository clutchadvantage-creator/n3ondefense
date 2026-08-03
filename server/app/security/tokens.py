import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt

from ..config import get_settings


def create_jwt(subject: str, token_type: str, lifetime: timedelta, extra: dict[str, Any] | None = None) -> str:
    now = datetime.now(UTC)
    payload: dict[str, Any] = {'sub': subject, 'type': token_type, 'iat': now, 'exp': now + lifetime}
    if extra:
        payload.update(extra)
    return jwt.encode(payload, get_settings().jwt_secret, algorithm='HS256')


def decode_jwt(token: str, expected_type: str) -> dict[str, Any]:
    payload = jwt.decode(token, get_settings().jwt_secret, algorithms=['HS256'])
    if payload.get('type') != expected_type:
        raise jwt.InvalidTokenError('Unexpected token type')
    return payload


def new_opaque_token() -> str:
    return secrets.token_urlsafe(48)


def hash_opaque_token(token: str) -> str:
    return hashlib.sha256(token.encode('utf-8')).hexdigest()
