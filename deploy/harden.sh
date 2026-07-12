#!/usr/bin/env bash
# One-time droplet hardening for the Voyage e-boarding server.
# Run as root:  bash /opt/voyage/deploy/harden.sh
#
# Idempotent — safe to re-run. Does NOT lock you out: SSH (22) stays open and
# root key-based login keeps working; only password auth is disabled.
set -euo pipefail

echo "── UFW firewall: allow SSH/HTTP/HTTPS only ──"
apt-get update -qq
apt-get install -y -qq ufw fail2ban > /dev/null
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw default deny incoming
ufw default allow outgoing
ufw --force enable
ufw status verbose

echo "── SSH: key-only authentication ──"
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
systemctl reload ssh || systemctl reload sshd

echo "── fail2ban: ban brute-force SSH attempts ──"
cat > /etc/fail2ban/jail.local <<'EOF'
[sshd]
enabled = true
maxretry = 5
findtime = 10m
bantime = 1h
EOF
systemctl enable --now fail2ban
systemctl restart fail2ban

echo "── secrets file permissions ──"
chmod 600 /opt/voyage/.env 2>/dev/null || true

echo "✔ hardening complete"
