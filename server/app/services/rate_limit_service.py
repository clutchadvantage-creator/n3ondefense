from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..models import RateLimitBucket


def enforce_rate_limit(db: Session, key: str, limit: int, window_seconds: int) -> None:
    now = datetime.now(UTC)
    bucket = db.scalar(select(RateLimitBucket).where(RateLimitBucket.key == key).with_for_update())
    if not bucket:
        db.add(RateLimitBucket(key=key, window_started_at=now, request_count=1))
        try:
            db.commit()
            return
        except IntegrityError:
            db.rollback()
            bucket = db.scalar(select(RateLimitBucket).where(RateLimitBucket.key == key).with_for_update())
            if not bucket:
                raise
    if bucket.window_started_at + timedelta(seconds=window_seconds) <= now:
        bucket.window_started_at = now
        bucket.request_count = 1
        db.commit()
        return
    if bucket.request_count >= limit:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, 'Rate limit exceeded.')
    bucket.request_count += 1
    db.commit()
