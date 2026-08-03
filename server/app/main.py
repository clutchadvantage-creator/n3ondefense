from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import admin, auth, health, leaderboards, runs
from .config import get_settings


settings = get_settings()
app = FastAPI(
    title='N3ONDefense Leaderboard API',
    version='0.1.0',
    docs_url='/docs' if settings.env != 'production' else None,
    servers=[
        {'url': 'https://api.n3ondefense.org', 'description': 'Production'},
        {'url': 'http://localhost:8010', 'description': 'Local development'},
    ],
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origin_list,
    allow_credentials=False,
    allow_methods=['GET', 'POST', 'PATCH'],
    allow_headers=['Authorization', 'Content-Type', 'X-Run-Token', 'X-Admin-Key'],
)
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(runs.router)
app.include_router(leaderboards.router)
app.include_router(admin.router)
