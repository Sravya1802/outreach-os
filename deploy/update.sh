#!/bin/bash
#
# OutreachOS — pull latest code + restart backend.
# Run on the Oracle VM whenever you want to deploy new commits.
#
#   sudo bash /home/ubuntu/outreach/deploy/update.sh
#
# Idempotent: safe to run repeatedly. Only restarts pm2 if code changed.

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
step() { echo -e "\n${BLUE}▸ $1${NC}"; }
ok()   { echo -e "${GREEN}✓${NC} $1"; }

[[ $EUID -eq 0 ]] || { echo "Run with sudo"; exit 1; }
TARGET_USER="${SUDO_USER:-ubuntu}"
APP_DIR="/home/$TARGET_USER/outreach"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-phase-4-pg}"
run_as_user() { sudo -u "$TARGET_USER" -H bash -c "$1"; }

step "Fetching latest from origin"
BEFORE=$(cd "$APP_DIR" && git rev-parse HEAD)
run_as_user "cd '$APP_DIR' && git fetch origin '$DEPLOY_BRANCH' && git merge --ff-only 'origin/$DEPLOY_BRANCH'"
AFTER=$(cd "$APP_DIR" && git rev-parse HEAD)

if [[ "$BEFORE" == "$AFTER" ]]; then
  ok "Already up to date ($BEFORE)"
  exit 0
fi

step "New commits: $BEFORE → $AFTER"
run_as_user "cd '$APP_DIR' && git log --oneline $BEFORE..$AFTER"

if run_as_user "cd '$APP_DIR' && git diff --name-only '$BEFORE' '$AFTER' -- backend/package.json backend/package-lock.json | grep -q ."; then
  step "Installing backend deps"
  if run_as_user "test -f '$APP_DIR/backend/package-lock.json'"; then
    run_as_user "cd '$APP_DIR/backend' && npm ci --omit=dev --legacy-peer-deps --loglevel=error"
  else
    run_as_user "cd '$APP_DIR/backend' && npm install --omit=dev --legacy-peer-deps --loglevel=error"
  fi
  ok "Backend deps current"
else
  ok "Backend deps unchanged"
fi

# If Playwright version changed, re-download Chromium
if run_as_user "cd '$APP_DIR/backend' && npm ls playwright 2>/dev/null" | grep -q "playwright@"; then
  step "Ensuring Playwright Chromium is present"
  run_as_user "cd '$APP_DIR/backend' && npx playwright install chromium"
  ok "Playwright Chromium OK"
fi

step "Restarting backend"
run_as_user "pm2 restart outreach-backend"
sleep 2
run_as_user "pm2 status"

step "Health check"
# pm2 restart returns before the Node process is listening; poll up to 30s.
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  if curl -fsS --max-time 2 http://localhost:3001/api/health 2>/dev/null | grep -q '"status":"ok"'; then
    ok "Backend healthy (attempt $attempt)"
    healthy=1
    break
  fi
  sleep 2
done
if [ -z "${healthy:-}" ]; then
  echo -e "${RED}Backend not healthy after 30s — check pm2 logs outreach-backend${NC}"
  exit 1
fi

ok "Update complete"
