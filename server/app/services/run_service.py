import hashlib
import hmac
import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import GameRun, Player, RunMilestone, RunStatus
from ..schemas.runs import CompleteRunRequest, MilestoneRequest, RunStartResponse, RunStatusResponse
from .token_service import run_token
from .verification_service import verify_completed_run


def _seed_for(run_id: uuid.UUID, player_id: uuid.UUID) -> int:
    digest = hmac.new(
        get_settings().run_seed_secret.encode('utf-8'),
        f'{run_id}:{player_id}'.encode('utf-8'),
        hashlib.sha256,
    ).digest()
    return int.from_bytes(digest[:4], 'big') & 0x7FFFFFFF


def start_run(db: Session, player: Player, game_version: str) -> RunStartResponse:
    run_id = uuid.uuid4()
    run = GameRun(id=run_id, player_id=player.id, seed=_seed_for(run_id, player.id), game_version=game_version)
    db.add(run)
    db.commit()
    token, seconds = run_token(str(player.id), str(run.id))
    return RunStartResponse(run_id=run.id, seed=run.seed, run_token=token, run_token_expires_in_seconds=seconds)


def submit_milestone(db: Session, run: GameRun, report: MilestoneRequest) -> RunStatusResponse:
    if run.completed_at:
        raise HTTPException(status.HTTP_409_CONFLICT, 'Run is already complete.')
    existing = db.scalar(select(RunMilestone).where(RunMilestone.run_id == run.id, RunMilestone.sequence == report.sequence))
    if existing:
        return RunStatusResponse(run_id=run.id, status=run.status.value, verification_reason=run.verification_reason)
    if report.sequence != run.last_milestone_sequence + 1:
        raise HTTPException(status.HTTP_409_CONFLICT, 'Milestone sequence is not contiguous.')
    prior = db.scalar(select(RunMilestone).where(RunMilestone.run_id == run.id).order_by(RunMilestone.sequence.desc()).limit(1))
    if prior and (
        report.highest_round < prior.round
        or report.enemies_destroyed < prior.enemies_destroyed
        or report.bomb_sites_destroyed < prior.bomb_sites_destroyed
        or report.credits_earned < prior.credits_earned
        or report.elapsed_ms < prior.elapsed_ms
    ):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, 'Milestone totals cannot decrease.')
    db.add(RunMilestone(
        run_id=run.id,
        sequence=report.sequence,
        round=report.highest_round,
        enemies_destroyed=report.enemies_destroyed,
        bomb_sites_destroyed=report.bomb_sites_destroyed,
        credits_earned=report.credits_earned,
        elapsed_ms=report.elapsed_ms,
    ))
    run.last_milestone_sequence = report.sequence
    db.commit()
    return RunStatusResponse(run_id=run.id, status=run.status.value)


def complete_run(db: Session, run: GameRun, report: CompleteRunRequest) -> RunStatusResponse:
    if run.completed_at:
        if run.idempotency_key == report.idempotency_key:
            return RunStatusResponse(run_id=run.id, status=run.status.value, verification_reason=run.verification_reason)
        raise HTTPException(status.HTTP_409_CONFLICT, 'Run was already completed with another idempotency key.')

    prior = db.scalar(select(RunMilestone).where(RunMilestone.run_id == run.id).order_by(RunMilestone.sequence.desc()).limit(1))
    if prior and (
        report.highest_round < prior.round
        or report.enemies_destroyed < prior.enemies_destroyed
        or report.bomb_sites_destroyed < prior.bomb_sites_destroyed
        or report.credits_earned < prior.credits_earned
        or report.elapsed_ms < prior.elapsed_ms
    ):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, 'Completion totals cannot be lower than the latest milestone.')

    decision = verify_completed_run(run, report)
    run.highest_round = report.highest_round
    run.rounds_completed = report.rounds_completed
    run.enemies_destroyed = report.enemies_destroyed
    run.bomb_sites_destroyed = report.bomb_sites_destroyed
    run.credits_earned = report.credits_earned
    run.duration_ms = report.elapsed_ms
    run.idempotency_key = report.idempotency_key
    run.status = decision.status
    run.verification_reason = decision.reason
    run.completed_at = datetime.now(UTC)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, 'Completion submission was already processed.') from exc
    return RunStatusResponse(run_id=run.id, status=run.status.value, verification_reason=run.verification_reason)
