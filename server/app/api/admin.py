import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import require_admin
from ..models import GameRun, Player, RunStatus
from ..schemas.admin import AdminRunDecision, AdminRunSummary


router = APIRouter(prefix='/v1/admin', tags=['admin'], dependencies=[Depends(require_admin)])


@router.get('/runs', response_model=list[AdminRunSummary])
def review_runs(
    run_status: RunStatus = Query(default=RunStatus.flagged, alias='status'),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> list[AdminRunSummary]:
    rows = db.execute(
        select(GameRun, Player).join(Player).where(GameRun.status == run_status).order_by(GameRun.completed_at.desc()).limit(limit)
    ).all()
    return [AdminRunSummary(
        run_id=run.id,
        public_player_id=player.public_id,
        display_name=player.display_name,
        status=run.status.value,
        highest_round=run.highest_round,
        enemies_destroyed=run.enemies_destroyed,
        bomb_sites_destroyed=run.bomb_sites_destroyed,
        verification_reason=run.verification_reason,
    ) for run, player in rows]


@router.patch('/runs/{run_id}', response_model=AdminRunSummary)
def decide_run(run_id: uuid.UUID, body: AdminRunDecision, db: Session = Depends(get_db)) -> AdminRunSummary:
    run = db.get(GameRun, run_id)
    if not run:
        raise HTTPException(status.HTTP_404_NOT_FOUND, 'Run not found.')
    player = db.get(Player, run.player_id)
    if not player:
        raise HTTPException(status.HTTP_404_NOT_FOUND, 'Player not found.')
    run.status = RunStatus(body.status)
    run.verification_reason = body.reason
    db.commit()
    return AdminRunSummary(
        run_id=run.id,
        public_player_id=player.public_id,
        display_name=player.display_name,
        status=run.status.value,
        highest_round=run.highest_round,
        enemies_destroyed=run.enemies_destroyed,
        bomb_sites_destroyed=run.bomb_sites_destroyed,
        verification_reason=run.verification_reason,
    )
