from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import current_player
from ..models import Player
from ..schemas.leaderboards import LeaderboardCategory, LeaderboardResponse, PersonalBestsResponse
from ..services.leaderboard_service import around_player, personal_entry, ranked_entries


router = APIRouter(prefix='/v1/leaderboards', tags=['leaderboards'])


@router.get('/me/bests', response_model=PersonalBestsResponse)
def personal_bests(player: Player = Depends(current_player), db: Session = Depends(get_db)) -> PersonalBestsResponse:
    return PersonalBestsResponse(
        highest_round=personal_entry(db, player, 'highest_round'),
        enemies_destroyed=personal_entry(db, player, 'enemies_destroyed'),
        bomb_sites_destroyed=personal_entry(db, player, 'bomb_sites_destroyed'),
    )


@router.get('/{category}/around-me', response_model=LeaderboardResponse)
def near_me(
    category: LeaderboardCategory,
    radius: int = Query(default=3, ge=1, le=10),
    player: Player = Depends(current_player),
    db: Session = Depends(get_db),
) -> LeaderboardResponse:
    return LeaderboardResponse(category=category, entries=around_player(db, player, category, radius))


@router.get('/{category}', response_model=LeaderboardResponse)
def leaderboard(
    category: LeaderboardCategory,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=100_000),
    db: Session = Depends(get_db),
) -> LeaderboardResponse:
    return LeaderboardResponse(category=category, entries=ranked_entries(db, category, limit, offset))
