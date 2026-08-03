from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_prefix='N3ON_', extra='ignore')

    env: str = 'development'
    database_url: str
    jwt_secret: str = Field(min_length=32)
    run_seed_secret: str = Field(min_length=32)
    admin_api_key: str = Field(min_length=24)
    allowed_origins: str = 'http://localhost:5173'
    access_token_minutes: int = Field(default=15, ge=5, le=60)
    refresh_token_days: int = Field(default=30, ge=1, le=180)
    run_token_hours: int = Field(default=8, ge=1, le=24)
    trusted_proxy_count: int = Field(default=1, ge=0, le=5)

    @property
    def allowed_origin_list(self) -> list[str]:
        return [part.strip() for part in self.allowed_origins.split(',') if part.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
