#!/usr/bin/env bash
# Nightly PostgreSQL backup for the Voyage e-boarding system.
#
# Installed automatically by deploy.sh as /etc/cron.d/voyage-backup (03:15 every
# night). Dumps the voyage DB from the compose container into
# /opt/voyage-backups/ (compressed, custom format) and keeps RETENTION_DAYS
# days. Restore with:
#   gunzip -c /opt/voyage-backups/voyage-YYYYMMDD-HHMM.dump.gz \
#     | docker compose -f /opt/voyage/docker-compose.yml exec -T db pg_restore -U voyage -d voyage --clean
#
# For real disaster recovery copy these files OFF the droplet — e.g. install
# rclone, configure a DigitalOcean Spaces remote called "spaces", and set
# OFFSITE_REMOTE=spaces:voyage-backups below (or in /opt/voyage/.env).
set -euo pipefail

APP_DIR=/opt/voyage
BACKUP_DIR=/opt/voyage-backups
RETENTION_DAYS=30
OFFSITE_REMOTE="${OFFSITE_REMOTE:-}" # e.g. spaces:voyage-backups (rclone remote)

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

stamp=$(date +%Y%m%d-%H%M)
out="$BACKUP_DIR/voyage-$stamp.dump.gz"

docker compose -f "$APP_DIR/docker-compose.yml" exec -T db \
  pg_dump -U voyage -d voyage --format=custom | gzip > "$out"

size=$(du -h "$out" | cut -f1)
echo "$(date -Is) backup OK: $out ($size)"

# rotate local copies
find "$BACKUP_DIR" -name 'voyage-*.dump.gz' -mtime "+$RETENTION_DAYS" -delete

# optional offsite copy (survives droplet loss)
if [ -n "$OFFSITE_REMOTE" ] && command -v rclone > /dev/null; then
  rclone copy "$out" "$OFFSITE_REMOTE/" --no-traverse
  echo "$(date -Is) offsite copy OK: $OFFSITE_REMOTE"
fi
