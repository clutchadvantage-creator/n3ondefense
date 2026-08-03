import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class Player(Base):
    __tablename__ = 'players'

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    public_id: Mapped[str] = mapped_column(String(24), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(24))
    display_name_normalized: Mapped[str] = mapped_column(String(24), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    banned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    sessions = relationship('PlayerSession', back_populates='player', cascade='all, delete-orphan')
    runs = relationship('GameRun', back_populates='player', cascade='all, delete-orphan')
