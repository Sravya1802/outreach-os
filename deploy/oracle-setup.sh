#!/bin/bash
#
# OutreachOS — one-shot installer for Oracle Always Free ARM VM (Ubuntu 22.04).
#
# Usage on a fresh VM:
#   curl -fsSL https://raw.githubusercontent.com/Sravya1802/outreach-os/local-backup/deploy/oracle-setup.sh -o setup.sh
#   chmod +x setup.sh
#   sudo ./setup.sh
#
# The script is idempotent — safe to re-run after errors or for updates.

set -euo pipefail

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
step() { echo -e "\n${BLUE}▸ $1${NC}"; }
ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }

# ── Preflight ────────────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || fail "Run with sudo: sudo ./setup.sh"
[[ "${SUDO_USER:-root}" != "root" ]] || fail "Do not run as root directly. Use: sudo ./setup.sh"

TARGET_USER="$SUDO_USER"
TARGET_HOME="/home/$TARGET_USER"
APP_DIR="$TARGET_HOME/outreach"
REPO_URL="https://github.com/Sravya1802/outreach-os.git"
REPO_BRANCH="local-backup"

run_as_user() { sudo -u "$TARGET_USER" -H bash -c "$1"; }

echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  OutreachOS — Oracle Always Free Installer${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo "Target user: $TARGET_USER"
echo "App directory: $APP_DIR"
echo "Repo: $REPO_URL ($REPO_BRANCH)"
echo ""

# ── Prompts ──────────────────────────────────────────────────────────────────
step "Configuration prompts"

read -rp "DuckDNS subdomain (e.g. 'outreach-jt' for outreach-jt.duckdns.org): " DUCKDNS_SUBDOMAIN
[[ -n "$DUCKDNS_SUBDOMAIN" ]] || fail "DuckDNS subdomain required"

read -rp "DuckDNS token (from duckdns.org top bar): " DUCKDNS_TOKEN
[[ -n "$DUCKDNS_TOKEN" ]] || fail "DuckDNS token required"

read -rp "Email for Let's Encrypt notices (e.g. you@example.com): " CERTBOT_EMAIL
[[ "$CERTBOT_EMAIL" =~ ^.+@.+\..+$ ]] || fail "Valid email required"

DOMAIN="${DUCKDNS_SUBDOMAIN}.duckdns.org"
step "Domain will be: https://$DOMAIN"

echo ""
read -rp "Path to your env file [default: /tmp/outreach.env]: " ENV_FILE_INPUT
ENV_FILE="${ENV_FILE_INPUT:-/tmp/outreach.env}"
if [[ ! -f "$ENV_FILE" ]]; then
  warn "Env file not found at $ENV_FILE"
  warn "Create it now from the template at deploy/env.template, then rerun this script."
  echo ""
  echo "Quickest way:"
  echo "  1. On your Mac: download deploy/env.template, fill in your keys"
  echo "  2. scp -i ~/.ssh/id_ed25519 env.template $TARGET_USER@$(curl -s ifconfig.me):/tmp/outreach.env"
  echo "  3. Rerun: sudo ./setup.sh"
  exit 1
fi

# Sanity-check a couple of required keys
grep -q "^OPENAI_API_KEY=" "$ENV_FILE" || warn "OPENAI_API_KEY missing from env — AI eval won't work"
grep -q "^APIFY_API_TOKEN=" "$ENV_FILE" || warn "APIFY_API_TOKEN missing from env — Apify scrapers won't work"

# ── System update ────────────────────────────────────────────────────────────
step "Updating apt package lists"
apt-get update -qq
ok "Apt refreshed"

step "Upgrading existing packages (may take 3-5 min)"
DEBIAN_FRONTEND=noninteractive apt-get upgrade -yqq
ok "Packages upgraded"

# ── Install essentials ───────────────────────────────────────────────────────
step "Installing base packages"
DEBIAN_FRONTEND=noninteractive apt-get install -yqq \
  curl ca-certificates gnupg lsb-release \
  git build-essential python3 python3-pip \
  nginx \
  certbot python3-certbot-nginx \
  fail2ban \
  unattended-upgrades \
  ufw \
  jq
ok "Base packages installed"

# ── Node 20 via nodesource ───────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1 || [[ $(node -v | cut -d. -f1 | tr -d v) -lt 20 ]]; then
  step "Installing Node.js 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -yqq nodejs
  ok "Node $(node -v) installed"
else
  ok "Node already installed: $(node -v)"
fi

# ── Install pm2 globally ─────────────────────────────────────────────────────
if ! command -v pm2 >/dev/null 2>&1; then
  step "Installing pm2"
  npm install -g pm2
  ok "pm2 installed"
else
  ok "pm2 already installed: $(pm2 -v)"
fi

# ── Playwright OS dependencies ───────────────────────────────────────────────
step "Installing Playwright OS dependencies (for Chromium)"
DEBIAN_FRONTEND=noninteractive apt-get install -yqq \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
  libcairo2 libasound2 libx11-6 libxcb1 libxext6 libxrender1 libdbus-1-3 \
  fonts-liberation fonts-noto-color-emoji
ok "Playwright OS deps installed"

# ── Clone repo ───────────────────────────────────────────────────────────────
if [[ -d "$APP_DIR/.git" ]]; then
  step "Repo exists — pulling latest"
  run_as_user "cd '$APP_DIR' && git fetch origin && git checkout $REPO_BRANCH && git pull origin $REPO_BRANCH"
  ok "Repo updated"
else
  step "Cloning repo"
  run_as_user "git clone --branch $REPO_BRANCH $REPO_URL '$APP_DIR'"
  ok "Repo cloned to $APP_DIR"
fi

# ── Install env file ─────────────────────────────────────────────────────────
step "Installing env file"
cp "$ENV_FILE" "$APP_DIR/.env"
chown "$TARGET_USER:$TARGET_USER" "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"
ok ".env installed at $APP_DIR/.env (mode 600)"

# ── Install backend deps ─────────────────────────────────────────────────────
step "Installing backend npm dependencies (2-3 min)"
run_as_user "cd '$APP_DIR/backend' && npm ci --omit=dev --loglevel=error"
ok "Backend deps installed"

# ── Install Playwright Chromium ──────────────────────────────────────────────
step "Downloading Playwright Chromium (2-4 min)"
run_as_user "cd '$APP_DIR/backend' && npx playwright install chromium"
ok "Playwright Chromium installed"

# ── Create log directory ─────────────────────────────────────────────────────
step "Creating log directory"
mkdir -p /var/log/outreach
chown -R "$TARGET_USER:$TARGET_USER" /var/log/outreach
ok "Log directory at /var/log/outreach"

# ── Set up DuckDNS refresh cron ──────────────────────────────────────────────
step "Configuring DuckDNS dynamic DNS refresh"
DUCKDNS_SCRIPT="/home/$TARGET_USER/duckdns-update.sh"
cat > "$DUCKDNS_SCRIPT" <<EOF
#!/bin/bash
echo url="https://www.duckdns.org/update?domains=${DUCKDNS_SUBDOMAIN}&token=${DUCKDNS_TOKEN}&ip=" | curl -k -o ~/duckdns.log -K -
EOF
chmod +x "$DUCKDNS_SCRIPT"
chown "$TARGET_USER:$TARGET_USER" "$DUCKDNS_SCRIPT"
bash "$DUCKDNS_SCRIPT"
( run_as_user "crontab -l 2>/dev/null" | grep -v duckdns-update.sh; echo "*/5 * * * * $DUCKDNS_SCRIPT >/dev/null 2>&1" ) | run_as_user "crontab -"
ok "DuckDNS refresh cron installed (runs every 5 min)"

# ── Configure nginx ──────────────────────────────────────────────────────────
step "Configuring nginx reverse proxy"
cp "$APP_DIR/backend/nginx.conf" /etc/nginx/sites-available/outreach
sed -i "s|SERVER_NAME_PLACEHOLDER|$DOMAIN|g" /etc/nginx/sites-available/outreach
ln -sf /etc/nginx/sites-available/outreach /etc/nginx/sites-enabled/outreach
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
ok "nginx configured for $DOMAIN"

# ── OS firewall (ufw) ────────────────────────────────────────────────────────
step "Configuring OS firewall (ufw)"
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable
# iptables fallback (Oracle images sometimes need this too)
iptables -I INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || true
iptables -I INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || true
# Save for persistence
DEBIAN_FRONTEND=noninteractive apt-get install -yqq iptables-persistent
netfilter-persistent save >/dev/null || true
ok "Firewall: 22, 80, 443 open"

# ── Let's Encrypt SSL ────────────────────────────────────────────────────────
step "Requesting Let's Encrypt SSL certificate (~30s)"
if [[ -d "/etc/letsencrypt/live/$DOMAIN" ]]; then
  warn "Cert already exists for $DOMAIN — skipping"
else
  # Give DuckDNS propagation a moment
  sleep 10
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "$CERTBOT_EMAIL" --redirect
  ok "SSL configured"
fi

# ── pm2 setup ────────────────────────────────────────────────────────────────
step "Starting backend under pm2"
run_as_user "cd '$APP_DIR' && pm2 delete outreach-backend 2>/dev/null || true"
run_as_user "cd '$APP_DIR/backend' && pm2 start ecosystem.config.cjs"
run_as_user "pm2 save"

# Install pm2 systemd unit so the app survives VM reboots
PM2_STARTUP_CMD=$(run_as_user "pm2 startup systemd -u $TARGET_USER --hp $TARGET_HOME" | tail -1)
if [[ "$PM2_STARTUP_CMD" == sudo* ]]; then
  eval "$PM2_STARTUP_CMD"
fi
ok "pm2 configured with auto-start on reboot"

# ── Keep-alive cron (prevent Oracle idle reclamation) ───────────────────────
step "Installing keep-alive cron"
( run_as_user "crontab -l 2>/dev/null" | grep -v keep-alive; echo "*/10 * * * * curl -sf http://localhost:3001/api/health >/dev/null # keep-alive" ) | run_as_user "crontab -"
ok "Keep-alive ping every 10 min"

# ── Unattended upgrades ──────────────────────────────────────────────────────
step "Enabling unattended security upgrades"
dpkg-reconfigure -f noninteractive unattended-upgrades
ok "Unattended-upgrades enabled"

# ── fail2ban ─────────────────────────────────────────────────────────────────
step "Enabling fail2ban for SSH"
systemctl enable --now fail2ban >/dev/null 2>&1
ok "fail2ban active"

# ── Verify ───────────────────────────────────────────────────────────────────
step "Verifying backend is responding"
sleep 3
if curl -fsS "https://$DOMAIN/api/health" >/dev/null; then
  ok "Backend is live at https://$DOMAIN/api/health"
else
  warn "Backend not responding yet via HTTPS — check pm2 logs"
  run_as_user "pm2 logs outreach-backend --lines 30 --nostream"
fi

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  SETUP COMPLETE${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Backend URL: https://$DOMAIN"
echo "Health check: https://$DOMAIN/api/health"
echo ""
echo "Useful commands:"
echo "  pm2 status                           - see running processes"
echo "  pm2 logs outreach-backend            - tail backend logs"
echo "  pm2 logs outreach-backend --lines 200 - last 200 lines"
echo "  pm2 restart outreach-backend         - restart after env changes"
echo "  sudo bash deploy/update.sh           - pull latest code + restart"
echo ""
echo "Paste this URL to the AI assistant to confirm Phase 2 complete:"
echo "  https://$DOMAIN/api/health"
echo ""
