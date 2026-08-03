import uuid

from app.models import GameRun, RunStatus
from app.schemas.runs import CompleteRunRequest
from app.services.verification_service import verify_completed_run


def make_run(milestones: int = 1) -> GameRun:
    return GameRun(id=uuid.uuid4(), player_id=uuid.uuid4(), seed=42, game_version='0.0.1', last_milestone_sequence=milestones)


def test_normal_run_is_verified() -> None:
    report = CompleteRunRequest(
        highest_round=3, rounds_completed=3, enemies_destroyed=80, bomb_sites_destroyed=9,
        credits_earned=2400, elapsed_ms=900_000, idempotency_key='0123456789abcdef', outcome='victory')
    assert verify_completed_run(make_run(), report).status == RunStatus.verified


def test_impossible_rate_is_rejected() -> None:
    report = CompleteRunRequest(
        highest_round=1, rounds_completed=1, enemies_destroyed=100_000, bomb_sites_destroyed=3,
        credits_earned=100, elapsed_ms=60_000, idempotency_key='0123456789abcdef', outcome='victory')
    assert verify_completed_run(make_run(), report).status == RunStatus.rejected


def test_long_run_without_milestones_is_flagged() -> None:
    report = CompleteRunRequest(
        highest_round=2, rounds_completed=2, enemies_destroyed=50, bomb_sites_destroyed=6,
        credits_earned=1000, elapsed_ms=1_300_000, idempotency_key='0123456789abcdef', outcome='victory')
    assert verify_completed_run(make_run(0), report).status == RunStatus.flagged
