from typing import Literal

from pydantic import BaseModel


LeaderboardCategory = Literal['highest_round', 'enemies_destroyed', 'bomb_sites_destroyed']
CampaignBoard = Literal['legacy', 'normal', 'overdrive', 'supreme']


class LeaderboardEntry(BaseModel):
    rank: int
    public_player_id: str
    display_name: str
    value: int
    run_id: str


class LeaderboardResponse(BaseModel):
    category: LeaderboardCategory
    campaign: CampaignBoard = 'legacy'
    entries: list[LeaderboardEntry]


class PersonalBestsResponse(BaseModel):
    campaign: CampaignBoard = 'legacy'
    highest_round: LeaderboardEntry | None
    enemies_destroyed: LeaderboardEntry | None
    bomb_sites_destroyed: LeaderboardEntry | None
