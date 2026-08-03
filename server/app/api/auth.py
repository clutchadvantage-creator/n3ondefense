from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.auth import AnonymousRegistration, RefreshRequest, TokenResponse
from ..services.auth_service import register_anonymous, rotate_refresh_token
from ..services.rate_limit_service import enforce_rate_limit


router = APIRouter(prefix='/v1/auth', tags=['auth'])


@router.post('/anonymous', response_model=TokenResponse, status_code=201)
def anonymous(body: AnonymousRegistration, request: Request, db: Session = Depends(get_db)) -> TokenResponse:
    enforce_rate_limit(db, f'auth:{request.client.host if request.client else "unknown"}', 10, 3600)
    return register_anonymous(db, body.display_name)


@router.post('/refresh', response_model=TokenResponse)
def refresh(body: RefreshRequest, request: Request, db: Session = Depends(get_db)) -> TokenResponse:
    enforce_rate_limit(db, f'refresh:{request.client.host if request.client else "unknown"}', 60, 3600)
    return rotate_refresh_token(db, body.refresh_token)
