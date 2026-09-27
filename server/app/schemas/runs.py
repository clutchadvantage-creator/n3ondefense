import uuid
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class RunStartRequest(BaseModel):
    game_version: str = Field(min_length=1, max_length=32)
    campaign_version: Literal[1, 2] = 1
    campaign_mode: Literal['normal', 'overdrive', 'supreme'] | None = None
    starting_round: int = Field(default=1, ge=1, le=30)

    @model_validator(mode='after')
    def campaign_is_explicit(self) -> 'RunStartRequest':
        if (self.campaign_version == 2) != (self.campaign_mode is not None):
            raise ValueError('Campaign version 2 requires exactly one campaign mode; legacy runs have no mode.')
        return self


class RunStartResponse(BaseModel):
    run_id: uuid.UUID
    seed: int
    run_token: str
    run_token_expires_in_seconds: int
    status: Literal['pending'] = 'pending'
    campaign_version: Literal[1, 2] = 1
    campaign_mode: Literal['normal', 'overdrive', 'supreme'] | None = None
    starting_round: int = 1


class RunProgress(BaseModel):
    highest_round: int = Field(ge=0, le=10_000)
    rounds_completed: int = Field(ge=0, le=10_000)
    boss_rounds_completed: int = Field(default=0, ge=0, le=6)
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
