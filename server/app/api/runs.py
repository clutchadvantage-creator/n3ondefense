import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import authorized_run, current_player
from ..models import GameRun, Player
from ..schemas.runs import CompleteRunRequest, MilestoneRequest, RunStartRequest, RunStartResponse, RunStatusResponse
from ..services.rate_limit_service import enforce_rate_limit
from ..services.run_service import complete_run, start_run, submit_milestone


router = APIRouter(prefix='/v1/runs', tags=['runs'])


@router.post('', response_model=RunStartResponse, status_code=201)
def create_run(
    body: RunStartRequest,
    request: Request,
    player: Player = Depends(current_player),
    db: Session = Depends(get_db),
) -> RunStartResponse:
    enforce_rate_limit(db, f'run-start:{player.id}:{request.client.host if request.client else "unknown"}', 30, 3600)
    return start_run(db, player, body.game_version)


@router.post('/{run_id}/milestones', response_model=RunStatusResponse)
def milestone(
    run_id: uuid.UUID,
    body: MilestoneRequest,
    run: GameRun = Depends(authorized_run),
    db: Session = Depends(get_db),
) -> RunStatusResponse:
    del run_id
    return submit_milestone(db, run, body)


@router.post('/{run_id}/complete', response_model=RunStatusResponse)
def complete(
    run_id: uuid.UUID,
    body: CompleteRunRequest,
    run: GameRun = Depends(authorized_run),
    db: Session = Depends(get_db),
) -> RunStatusResponse:
    del run_id
    return complete_run(db, run, body)
