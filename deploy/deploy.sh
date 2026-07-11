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

echo "==> Installing docker & nginx (if missing)…"
if ! command -v docker > /dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
apt-get update -qq
apt-get install -y -qq nginx ufw > /dev/null

echo "==> Firewall (SSH + HTTP/HTTPS only)…"
ufw allow OpenSSH > /dev/null
ufw allow 'Nginx Full' > /dev/null
ufw --force enable > /dev/null

echo "==> Building & starting containers…"
docker compose up -d --build

echo "==> Configuring nginx…"
cp deploy/nginx-voyage.conf /etc/nginx/sites-available/voyage
ln -sf /etc/nginx/sites-available/voyage /etc/nginx/sites-enabled/voyage
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo
echo "✔ Deploy complete."
echo "  App:      http://$(hostname -I | awk '{print $1}')/"
echo "  Health:   curl -s localhost:4000/api/health"
echo
echo "  voyage.mn домэйн A бичлэгээ энэ серверт зааж өгсний дараа HTTPS идэвхжүүлнэ:"
echo "    apt-get install -y certbot python3-certbot-nginx"
echo "    certbot --nginx -d voyage.mn -d www.voyage.mn"
