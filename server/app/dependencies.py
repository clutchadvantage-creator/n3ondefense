import hmac
import uuid

import jwt
from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import get_settings
from .database import get_db
from .models import GameRun, Player
from .security.tokens import decode_jwt


bearer = HTTPBearer(auto_error=False)


def current_player(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> Player:
    if not credentials:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, 'Access credential required.')
    try:
        payload = decode_jwt(credentials.credentials, 'access')
        player_id = uuid.UUID(str(payload['sub']))
    except (jwt.InvalidTokenError, KeyError, ValueError) as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, 'Access credential is invalid or expired.') from exc
    player = db.get(Player, player_id)
    if not player or player.banned_at:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, 'Player is unavailable.')
    return player


def authorized_run(
    request: Request,
    player: Player = Depends(current_player),
    run_token: str | None = Header(default=None, alias='X-Run-Token'),
    db: Session = Depends(get_db),
) -> GameRun:
    if not run_token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, 'Run credential required.')
    try:
        payload = decode_jwt(run_token, 'run')
        run_id = uuid.UUID(str(payload['run_id']))
    except (jwt.InvalidTokenError, KeyError, ValueError) as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, 'Run credential is invalid or expired.') from exc
    path_run_id = request.path_params.get('run_id')
    if path_run_id and str(run_id) != str(path_run_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, 'Run credential does not match request.')
    run = db.get(GameRun, run_id)
    if not run or run.player_id != player.id or str(payload.get('sub')) != str(player.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, 'Run does not belong to this player.')
    return run


def require_admin(x_admin_key: str | None = Header(default=None, alias='X-Admin-Key')) -> None:
    if not x_admin_key or not hmac.compare_digest(x_admin_key, get_settings().admin_api_key):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, 'Administrator credential required.')
