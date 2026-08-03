import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, UniqueConstraint, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class RunMilestone(Base):
    __tablename__ = 'run_milestones'
    __table_args__ = (UniqueConstraint('run_id', 'sequence', name='uq_milestone_run_sequence'),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('game_runs.id', ondelete='CASCADE'), index=True)
    sequence: Mapped[int] = mapped_column(Integer)
    round: Mapped[int] = mapped_column(Integer)
    enemies_destroyed: Mapped[int] = mapped_column(Integer)
    bomb_sites_destroyed: Mapped[int] = mapped_column(Integer)
    credits_earned: Mapped[int] = mapped_column(Integer)
    elapsed_ms: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    run = relationship('GameRun', back_populates='milestones')
