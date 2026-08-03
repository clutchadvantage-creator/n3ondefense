from pydantic import BaseModel, Field


class AnonymousRegistration(BaseModel):
    display_name: str = Field(min_length=3, max_length=24)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=32, max_length=300)


class PlayerIdentity(BaseModel):
    public_id: str
    display_name: str


class TokenResponse(BaseModel):
    player: PlayerIdentity
    access_token: str
    access_expires_in_seconds: int
    refresh_token: str
    refresh_expires_in_seconds: int
