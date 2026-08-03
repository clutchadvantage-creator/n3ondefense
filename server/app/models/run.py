import enum
import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Enum, ForeignKey, Integer, String, UniqueConstraint, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class RunStatus(str, enum.Enum):
    pending = 'pending'
    verified = 'verified'
    flagged = 'flagged'
    rejected = 'rejected'


class GameRun(Base):
    __tablename__ = 'game_runs'
    __table_args__ = (UniqueConstraint('player_id', 'idempotency_key', name='uq_run_player_idempotency'),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    player_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('players.id', ondelete='CASCADE'), index=True)
    seed: Mapped[int] = mapped_column(BigInteger)
    game_version: Mapped[str] = mapped_column(String(32))
    status: Mapped[RunStatus] = mapped_column(Enum(RunStatus, name='run_status'), default=RunStatus.pending, index=True)
    highest_round: Mapped[int] = mapped_column(Integer, default=0)
    rounds_completed: Mapped[int] = mapped_column(Integer, default=0)
    enemies_destroyed: Mapped[int] = mapped_column(Integer, default=0)
    bomb_sites_destroyed: Mapped[int] = mapped_column(Integer, default=0)
    credits_earned: Mapped[int] = mapped_column(Integer, default=0)
    duration_ms: Mapped[int] = mapped_column(BigInteger, default=0)
    last_milestone_sequence: Mapped[int] = mapped_column(Integer, default=0)
    idempotency_key: Mapped[str | None] = mapped_column(String(64))
    verification_reason: Mapped[str | None] = mapped_column(String(500))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    player = relationship('Player', back_populates='runs')
    milestones = relationship('RunMilestone', back_populates='run', cascade='all, delete-orphan')
