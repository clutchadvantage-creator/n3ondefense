import uuid
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class RunStartRequest(BaseModel):
    game_version: str = Field(min_length=1, max_length=32)


class RunStartResponse(BaseModel):
    run_id: uuid.UUID
    seed: int
    run_token: str
    run_token_expires_in_seconds: int
    status: Literal['pending'] = 'pending'


class RunProgress(BaseModel):
    highest_round: int = Field(ge=0, le=10_000)
    rounds_completed: int = Field(ge=0, le=10_000)
    enemies_destroyed: int = Field(ge=0, le=10_000_000)
    bomb_sites_destroyed: int = Field(ge=0, le=1_000_000)
    credits_earned: int = Field(ge=0, le=2_000_000_000)
    elapsed_ms: int = Field(ge=0, le=2_592_000_000)

    @model_validator(mode='after')
    def relationships_are_possible(self) -> 'RunProgress':
        if self.rounds_completed > self.highest_round:
            raise ValueError('rounds_completed cannot exceed highest_round')
        return self


class MilestoneRequest(RunProgress):
    sequence: int = Field(ge=1, le=1_000_000)


class CompleteRunRequest(RunProgress):
    idempotency_key: str = Field(min_length=16, max_length=64)
    outcome: Literal['victory', 'player_dead', 'bomb_defused', 'quit']


class RunStatusResponse(BaseModel):
    run_id: uuid.UUID
    status: Literal['pending', 'verified', 'flagged', 'rejected']
    verification_reason: str | None = None
