from datetime import timedelta

from ..config import get_settings
from ..security.tokens import create_jwt


def access_token(player_id: str) -> tuple[str, int]:
    seconds = get_settings().access_token_minutes * 60
    return create_jwt(player_id, 'access', timedelta(seconds=seconds)), seconds


def run_token(player_id: str, run_id: str) -> tuple[str, int]:
    seconds = get_settings().run_token_hours * 3600
    return create_jwt(player_id, 'run', timedelta(seconds=seconds), {'run_id': run_id}), seconds
