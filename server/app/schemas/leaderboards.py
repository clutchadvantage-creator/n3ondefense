from typing import Literal

from pydantic import BaseModel


LeaderboardCategory = Literal['highest_round', 'enemies_destroyed', 'bomb_sites_destroyed']


class LeaderboardEntry(BaseModel):
    rank: int
    public_player_id: str
    display_name: str
    value: int
    run_id: str


class LeaderboardResponse(BaseModel):
    category: LeaderboardCategory
    entries: list[LeaderboardEntry]


class PersonalBestsResponse(BaseModel):
    highest_round: LeaderboardEntry | None
    enemies_destroyed: LeaderboardEntry | None
    bomb_sites_destroyed: LeaderboardEntry | None
