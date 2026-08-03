#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo. No changes were made." >&2
  exit 1
fi

if [[ "$#" -ne 0 ]]; then
  echo "Usage: sudo ./deploy/initialize-server-state.sh" >&2
  exit 1
fi

if [[ -e /etc/n3ondefense/n3ondefense.env ]]; then
  echo "/etc/n3ondefense/n3ondefense.env already exists; refusing to rotate live credentials." >&2
  exit 1
fi

if runuser -u postgres -- psql --dbname=postgres --tuples-only --no-align --command="SELECT 1 FROM pg_roles WHERE rolname='n3ondefense_api' UNION ALL SELECT 1 FROM pg_database WHERE datname='n3ondefense'" | grep -q 1; then
  echo "The n3ondefense role or database already exists; refusing to modify unknown existing state." >&2
  exit 1
fi

db_password="$(openssl rand -hex 32)"
jwt_secret="$(openssl rand -hex 32)"
seed_secret="$(openssl rand -hex 32)"
admin_key="$(openssl rand -hex 32)"

install -d -m 0755 -o root -g root /opt/n3ondefense
install -d -m 0755 -o root -g n3ondefense /opt/n3ondefense/app
install -d -m 0750 -o root -g n3ondefense /etc/n3ondefense

runuser -u postgres -- psql --dbname=postgres --set=db_password="${db_password}" --file=/opt/n3ondefense/app/deploy/create-database.sql

umask 0027
cat > /etc/n3ondefense/n3ondefense.env <<EOF
N3ON_ENV=production
N3ON_DATABASE_URL=postgresql+psycopg://n3ondefense_api:${db_password}@127.0.0.1:5432/n3ondefense
N3ON_JWT_SECRET=${jwt_secret}
N3ON_RUN_SEED_SECRET=${seed_secret}
N3ON_ADMIN_API_KEY=${admin_key}
N3ON_ALLOWED_ORIGINS=https://n3ondefense.org,https://www.n3ondefense.org
N3ON_ACCESS_TOKEN_MINUTES=15
N3ON_REFRESH_TOKEN_DAYS=30
N3ON_RUN_TOKEN_HOURS=8
N3ON_TRUSTED_PROXY_COUNT=1
EOF
chown root:n3ondefense /etc/n3ondefense/n3ondefense.env
chmod 0640 /etc/n3ondefense/n3ondefense.env

echo "Dedicated database, role, directories, and environment file initialized. Secrets were not printed."
