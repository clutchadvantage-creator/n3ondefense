import uuid
from typing import Literal

from pydantic import BaseModel, Field


class AdminRunDecision(BaseModel):
    status: Literal['verified', 'flagged', 'rejected']
    reason: str = Field(min_length=3, max_length=500)


class AdminRunSummary(BaseModel):
    run_id: uuid.UUID
    public_player_id: str
    display_name: str
    status: str
    highest_round: int
    enemies_destroyed: int
    bomb_sites_destroyed: int
    verification_reason: str | None
