# N3ONDefense Leaderboard API — candyserver deployment

This FastAPI service is isolated from CandyVault. Its confirmed production target is:

```text
https://api.n3ondefense.org
  -> Cloudflare Tunnel (later step)
  -> 127.0.0.1:8010 on candyserver
  -> PostgreSQL 18.4 at 127.0.0.1:5432
  -> database n3ondefense, role n3ondefense_api
```

It must not use `/opt/candyvault`, Compose project `app`, ports 80/8000, CandyVault environment files, or CandyVault Docker networks. UFW does not need a public 8010 rule because both FastAPI and PostgreSQL remain loopback-only.

The complete staged procedure is in [deploy/CANDYSERVER_DEPLOYMENT.md](deploy/CANDYSERVER_DEPLOYMENT.md). Nothing in these files deploys automatically.

## Development

The production runtime is pinned by `.python-version` and `pyproject.toml` to Python 3.13. On a development machine with `uv`:

```bash
uv python install 3.13
uv venv --python 3.13 .venv
uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/python -m pytest
```

On Windows, use `.venv/Scripts/python.exe` for the final command.

## API surface

- `GET /health`
- `POST /v1/auth/anonymous`
- `POST /v1/auth/refresh`
- `POST /v1/runs`
- `POST /v1/runs/{id}/milestones`
- `POST /v1/runs/{id}/complete`
- `GET /v1/leaderboards/{category}`
- `GET /v1/leaderboards/{category}/around-me`
- `GET /v1/leaderboards/me/bests`
- `GET/PATCH /v1/admin/runs`

The admin key belongs only in `/etc/n3ondefense/n3ondefense.env`. Never place it in the Vite application.

## Confirmed production web configuration

```text
Game origin:       https://n3ondefense.org
Additional origin: https://www.n3ondefense.org
API origin:        https://api.n3ondefense.org
Frontend variable: VITE_API_BASE_URL=https://api.n3ondefense.org
Backend CORS:      https://n3ondefense.org,https://www.n3ondefense.org
```

Local development remains:

```text
VITE_API_BASE_URL=http://localhost:8010
```

Only the Cloudflare tunnel ID and generated credentials-file path remain intentionally unresolved. The tunnel must not be created or deployed until that later step is explicitly authorized.
