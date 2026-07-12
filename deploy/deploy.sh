#!/usr/bin/env bash
# Voyage E-Boarding — one-shot deploy script for a fresh Ubuntu droplet.
# Usage (on the droplet, as root):
#   git clone https://github.com/Temuujinhub/voyage.mn.git /opt/voyage
#   cd /opt/voyage && cp .env.example .env && nano .env   # fill secrets
#   bash deploy/deploy.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

if [ ! -f .env ]; then
  echo "ERROR: .env файл алга. cp .env.example .env хийгээд нууц утгуудаа бөглөнө үү." >&2
  exit 1
fi
chmod 600 .env # secrets are root-read-only

echo "==> Installing docker & nginx (if missing)…"
if ! command -v docker > /dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
if ! command -v nginx > /dev/null || ! command -v ufw > /dev/null; then
  apt-get update -qq
  apt-get install -y -qq nginx ufw > /dev/null
  echo "==> Firewall (SSH + HTTP/HTTPS only)…"
  ufw allow OpenSSH > /dev/null
  ufw allow 'Nginx Full' > /dev/null
  ufw --force enable > /dev/null
fi

echo "==> Building & starting containers…"
docker compose up -d --build

# Postgres bakes POSTGRES_PASSWORD into its data volume on first init and
# ignores it afterwards. If the value the volume was created with ever differs
# from the current one, the app gets 'password authentication failed'.
# Re-sync the role's password on every deploy so app and DB never drift, without
# wiping data. The password is read from the db container's own $POSTGRES_PASSWORD
# — the exact same value docker compose passes to the app as PGPASSWORD, so the
# two cannot disagree (reading .env on the host would parse #/quotes/spaces
# differently than compose does). The container's local socket is trust-auth, so
# no password is needed to run the ALTER. Interpolation is avoided by building
# the SQL literal in-container with single quotes doubled.
echo "==> Syncing DB role password so app and DB never drift…"
for i in $(seq 1 15); do
  if docker compose exec -T db pg_isready -U voyage -d voyage > /dev/null 2>&1; then break; fi
  sleep 2
done
if docker compose exec -T db sh -s <<'INNER'
esc=$(printf '%s' "$POSTGRES_PASSWORD" | sed "s/'/''/g")
psql -U voyage -d voyage -v ON_ERROR_STOP=1 -c "ALTER USER voyage WITH PASSWORD '$esc';"
INNER
then
  docker compose restart app
else
  echo "   (password sync skipped — will rely on existing credentials)"
fi

echo "==> Configuring nginx…"
# don't clobber a certbot-managed config on re-deploys
if [ ! -f /etc/nginx/sites-available/voyage ] || ! grep -q 'managed by Certbot' /etc/nginx/sites-available/voyage; then
  cp deploy/nginx-voyage.conf /etc/nginx/sites-available/voyage
fi
ln -sf /etc/nginx/sites-available/voyage /etc/nginx/sites-enabled/voyage
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "==> Waiting for the app to become healthy…"
healthy=false
for i in $(seq 1 20); do
  if curl -sf localhost:4000/api/health > /dev/null 2>&1; then
    healthy=true
    echo "   app healthy after ${i} tries"
    break
  fi
  sleep 2
done
if [ "$healthy" != true ]; then
  echo "⚠️  App нь 4000 порт дээр хариу өгсөнгүй. Сүүлийн лог:"
  docker compose logs --tail=40 app || true
  echo "   DB нууц үг зөрүүлбэл (өмнөх volume): docker compose down -v && docker compose up -d --build"
fi

echo "==> Nightly DB backup cron…"
chmod +x "$APP_DIR/deploy/backup.sh"
cat > /etc/cron.d/voyage-backup <<CRON
# nightly Voyage DB dump (installed by deploy.sh - edit deploy/backup.sh instead)
15 3 * * * root bash $APP_DIR/deploy/backup.sh >> /var/log/voyage-backup.log 2>&1
CRON
chmod 644 /etc/cron.d/voyage-backup
echo "   /etc/cron.d/voyage-backup -> 03:15 in /opt/voyage-backups/ (pg_dump)"

echo
echo "✔ Deploy complete."
echo "  App:      http://$(hostname -I | awk '{print $1}')/"
echo "  Health:   curl -s localhost:4000/api/health"
echo
echo "  voyage.mn домэйн A бичлэгээ энэ серверт зааж өгсний дараа HTTPS идэвхжүүлнэ:"
echo "    apt-get install -y certbot python3-certbot-nginx"
echo "    certbot --nginx -d voyage.mn -d www.voyage.mn"
