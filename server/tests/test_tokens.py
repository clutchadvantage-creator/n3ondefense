import pytest
import jwt

from app.security.tokens import create_jwt, decode_jwt
from datetime import timedelta


def test_token_type_is_enforced() -> None:
    token = create_jwt('player', 'access', timedelta(minutes=5))
    assert decode_jwt(token, 'access')['sub'] == 'player'
    with pytest.raises(jwt.InvalidTokenError):
        decode_jwt(token, 'run')
