from dataclasses import dataclass
from datetime import UTC, datetime

from ..models import GameRun, RunStatus
from ..schemas.runs import CompleteRunRequest


@dataclass(frozen=True)
class VerificationDecision:
    status: RunStatus
    reason: str


def verify_completed_run(run: GameRun, report: CompleteRunRequest) -> VerificationDecision:
    if report.elapsed_ms < 5_000:
        return VerificationDecision(RunStatus.rejected, 'Run duration is below the technical minimum.')
    if report.highest_round == 0 and report.rounds_completed > 0:
        return VerificationDecision(RunStatus.rejected, 'Completed rounds require a highest round.')
    if report.bomb_sites_destroyed < report.rounds_completed:
        return VerificationDecision(RunStatus.rejected, 'Bomb-site count is below completed-round count.')
    if report.enemies_destroyed < report.rounds_completed:
        return VerificationDecision(RunStatus.flagged, 'Enemy count is unusually low for completed rounds.')
    minutes = max(1, report.elapsed_ms / 60_000)
    if report.enemies_destroyed / minutes > 500:
        return VerificationDecision(RunStatus.rejected, 'Enemy destruction rate exceeds the hard safety limit.')
    if report.credits_earned / minutes > 250_000:
        return VerificationDecision(RunStatus.rejected, 'Credit earning rate exceeds the hard safety limit.')
    if run.started_at:
        server_elapsed_ms = max(0, int((datetime.now(UTC) - run.started_at).total_seconds() * 1000))
        if report.elapsed_ms > server_elapsed_ms + 120_000:
            return VerificationDecision(RunStatus.rejected, 'Reported duration exceeds server-observed duration.')
        if server_elapsed_ms > 120_000 and report.elapsed_ms < server_elapsed_ms * 0.45:
            return VerificationDecision(RunStatus.flagged, 'Reported duration is substantially below server-observed duration.')
    if report.highest_round > 250 or report.bomb_sites_destroyed > report.highest_round * 12 + 12:
        return VerificationDecision(RunStatus.flagged, 'Run exceeds the automatic-verification envelope.')
    if run.last_milestone_sequence == 0 and report.elapsed_ms > 20 * 60_000:
        return VerificationDecision(RunStatus.flagged, 'Long run completed without milestones.')
    return VerificationDecision(RunStatus.verified, 'Passed statistical verification.')
