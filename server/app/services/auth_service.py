import secrets
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Player, PlayerSession
from ..schemas.auth import PlayerIdentity, TokenResponse
from ..security.tokens import hash_opaque_token, new_opaque_token
from .display_name_service import validate_display_name
from .token_service import access_token


def _public_id() -> str:
    return f'N3-{secrets.token_hex(6).upper()}'


def _issue_session(db: Session, player: Player) -> TokenResponse:
    refresh = new_opaque_token()
    refresh_seconds = get_settings().refresh_token_days * 86400
    session = PlayerSession(
        player_id=player.id,
        refresh_token_hash=hash_opaque_token(refresh),
        expires_at=datetime.now(UTC) + timedelta(seconds=refresh_seconds),
    )
    db.add(session)
    token, access_seconds = access_token(str(player.id))
    return TokenResponse(
        player=PlayerIdentity(public_id=player.public_id, display_name=player.display_name),
        access_token=token,
        access_expires_in_seconds=access_seconds,
        refresh_token=refresh,
        refresh_expires_in_seconds=refresh_seconds,
    )


def register_anonymous(db: Session, raw_display_name: str) -> TokenResponse:
    display, normalized = validate_display_name(raw_display_name)
    player = Player(public_id=_public_id(), display_name=display, display_name_normalized=normalized)
    db.add(player)
    try:
        db.flush()
        response = _issue_session(db, player)
        db.commit()
        return response
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, 'Display name is already in use.') from exc


def rotate_refresh_token(db: Session, refresh_token: str) -> TokenResponse:
    now = datetime.now(UTC)
    session = db.scalar(select(PlayerSession).where(PlayerSession.refresh_token_hash == hash_opaque_token(refresh_token)).with_for_update())
    if not session or session.revoked_at or session.expires_at <= now:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, 'Refresh credential is invalid or expired.')
    player = db.get(Player, session.player_id)
    if not player or player.banned_at:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, 'Player is unavailable.')
    session.revoked_at = now
    session.last_used_at = now
    response = _issue_session(db, player)
    db.commit()
    return response
