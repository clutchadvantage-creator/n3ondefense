# candyserver staged deployment runbook

These commands are prepared for the confirmed host `runt@candyserver` (`192.168.0.29`). They are documentation only. Do not run them until the source transfer method and maintenance window are confirmed.

## Fixed values

| Item | Value |
|---|---|
| Host | `candyserver` |
| SSH account | `runt` |
| Service account | `n3ondefense` (system, non-login) |
| Install root | `/opt/n3ondefense` |
| Source/working directory | `/opt/n3ondefense/app` |
| Virtual environment | `/opt/n3ondefense/.venv` |
| Managed Python location | `/opt/n3ondefense/python` |
| Environment file | `/etc/n3ondefense/n3ondefense.env` |
| Unit | `n3ondefense-api.service` |
| API | `127.0.0.1:8010` |
| PostgreSQL | `127.0.0.1:5432`, version 18.4 |
| Database | `n3ondefense` |
| Role | `n3ondefense_api` |
| Game origins | `https://n3ondefense.org`, `https://www.n3ondefense.org` |
| Public API | `https://api.n3ondefense.org` |

## 1. Read-only preflight

```bash
ssh runt@candyserver
hostnamectl --static
python3 --version
psql --version
sudo ss -lntp | grep -E ':(22|80|8000|8010|5432)[[:space:]]' || true
sudo test ! -e /opt/n3ondefense && echo '/opt/n3ondefense is available'
sudo test ! -e /etc/n3ondefense && echo '/etc/n3ondefense is available'
getent passwd n3ondefense || true
sudo -u postgres psql -d postgres -Atc "SELECT datname FROM pg_database WHERE datname='n3ondefense'; SELECT rolname FROM pg_roles WHERE rolname='n3ondefense_api';"
```

Stop if port 8010, either target directory, the service account, database, or role already exists unexpectedly. Inspect it rather than overwriting it.

## 2. Stage source without touching CandyVault

Transfer only the repository's `server/` contents to a temporary directory owned by `runt`. Exclude `.venv`, `.env`, `__pycache__`, and `.pytest_cache`. The final transfer command depends on where the repository is hosted and has deliberately not been guessed.

Once the clean files exist at `~/n3ondefense-release/server`:

```bash
sudo useradd --system --user-group --home-dir /opt/n3ondefense --no-create-home --shell /usr/sbin/nologin n3ondefense
sudo install -d -m 0755 -o root -g root /opt/n3ondefense
sudo install -d -m 0755 -o root -g n3ondefense /opt/n3ondefense/app
sudo cp -a ~/n3ondefense-release/server/. /opt/n3ondefense/app/
sudo rm -rf /opt/n3ondefense/app/.venv /opt/n3ondefense/app/.pytest_cache
sudo find /opt/n3ondefense/app -type d -name __pycache__ -prune -exec rm -rf {} +
sudo chown -R root:n3ondefense /opt/n3ondefense/app
sudo find /opt/n3ondefense/app -type d -exec chmod 0755 {} +
sudo find /opt/n3ondefense/app -type f -exec chmod 0644 {} +
sudo chmod 0750 /opt/n3ondefense/app/deploy/initialize-server-state.sh
```

These targets do not overlap `/opt/candyvault`.

## 3. Install uv and application-owned Python 3.13

Install `uv` as `runt`, then place only the `uv` executable in `/usr/local/bin`. Do not modify `/usr/bin/python3`.

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
UV_SOURCE="$(command -v uv)"
test -x "${UV_SOURCE}"
sudo install -m 0755 "${UV_SOURCE}" /usr/local/bin/uv
sudo env UV_PYTHON_INSTALL_DIR=/opt/n3ondefense/python /usr/local/bin/uv python install 3.13
sudo env UV_PYTHON_INSTALL_DIR=/opt/n3ondefense/python /usr/local/bin/uv venv --python 3.13 /opt/n3ondefense/.venv
sudo /usr/local/bin/uv pip install --python /opt/n3ondefense/.venv/bin/python -r /opt/n3ondefense/app/requirements.txt
/opt/n3ondefense/.venv/bin/python --version
```

The final version must report Python 3.13.x. The venv and interpreter remain under `/opt/n3ondefense`, not under `/home/runt` and not under `/usr/bin`.

## 4. Create isolated secrets, role, database, and environment

The initialization script generates four independent random secrets on `candyserver`. It does not print them. It refuses to run if the environment file, database, or role already exists. Its fixed non-wildcard CORS allowlist is `https://n3ondefense.org,https://www.n3ondefense.org`.

```bash
sudo /opt/n3ondefense/app/deploy/initialize-server-state.sh
sudo stat -c '%U %G %a %n' /etc/n3ondefense/n3ondefense.env
sudo -u postgres psql -d postgres -c '\du n3ondefense_api'
sudo -u postgres psql -d postgres -c '\l n3ondefense'
```

Expected environment ownership/mode: `root n3ondefense 640`. Do not paste its contents into chat or shell logs.

## 5. Validate before installing systemd

```bash
cd /opt/n3ondefense/app
sudo -u n3ondefense /opt/n3ondefense/.venv/bin/python -m pytest -q
```

The first migration is intentionally left to systemd's `ExecStartPre`, which reads the protected `EnvironmentFile` without placing credentials on the command line. Inspect the tables after the first successful service start.

## 6. Install the hardened systemd service

```bash
sudo install -m 0644 -o root -g root /opt/n3ondefense/app/deploy/n3ondefense-api.service /etc/systemd/system/n3ondefense-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now n3ondefense-api.service
sudo systemctl status n3ondefense-api.service --no-pager
sudo journalctl -u n3ondefense-api.service -n 100 --no-pager
curl --fail --silent --show-error http://127.0.0.1:8010/health
sudo ss -lntp | grep '127.0.0.1:8010'
sudo -u postgres psql -d n3ondefense -c '\dt'
```

Expected health response: `{"status":"ok"}`. The listener must be `127.0.0.1:8010`, never `0.0.0.0:8010`. Do not add a UFW or router-forwarding rule for 8010.

Confirm CandyVault remains unchanged:

```bash
docker compose -p app -f /opt/candyvault/app/docker-compose.yml ps
curl --fail --silent --show-error http://127.0.0.1:8000/ >/dev/null
```

## 7. Cloudflare Tunnel — later deployment step

Cloudflared is not currently installed. The production hostname is confirmed as `api.n3ondefense.org`, but do not install, authenticate, create, or deploy a tunnel until that later step is explicitly authorized.

When those values are available:

1. Install `cloudflared` from Cloudflare's Ubuntu package repository.
2. Authenticate interactively as the Cloudflare account owner.
3. Create a dedicated tunnel for N3ONDefense or explicitly approve reuse of another tunnel.
4. Copy `deploy/cloudflared-config.yml.example`, replacing only the tunnel ID and credentials path.
5. Route `api.n3ondefense.org` to `http://127.0.0.1:8010`.
6. Install/start the cloudflared systemd service and verify `/health` through HTTPS.
7. Build the frontend with `VITE_API_BASE_URL=https://api.n3ondefense.org`.

The public hostname is committed intentionally; Cloudflare credentials and tunnel IDs are not.

## 8. Updates and rollback

For an update, stage clean source first, back up the database, stop the API, replace only `/opt/n3ondefense/app`, reinstall pinned dependencies, run tests/migrations, and restart:

```bash
sudo -u postgres pg_dump --format=custom --file=/var/tmp/n3ondefense-before-update.dump n3ondefense
sudo systemctl stop n3ondefense-api.service
# Replace /opt/n3ondefense/app from the reviewed staging directory only.
sudo /usr/local/bin/uv pip install --python /opt/n3ondefense/.venv/bin/python -r /opt/n3ondefense/app/requirements.txt
sudo -u n3ondefense /opt/n3ondefense/.venv/bin/python -m pytest -q
sudo systemctl start n3ondefense-api.service
curl --fail http://127.0.0.1:8010/health
```

Do not use `alembic downgrade` as an automatic rollback. Restore the reviewed application version and database backup together when a migration is not backward-compatible.
