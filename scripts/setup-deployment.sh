#!/usr/bin/env bash
# setup-deployment.sh
# Interactive helper script that validates your AI Builder deployment configuration.
# Run this before deploying to confirm all required values are in place.
#
# Usage:
#   chmod +x scripts/setup-deployment.sh
#   ./scripts/setup-deployment.sh

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

ok()   { echo -e "${GREEN}  ✓  $*${RESET}"; }
warn() { echo -e "${YELLOW}  ⚠  $*${RESET}"; }
fail() { echo -e "${RED}  ✗  $*${RESET}"; }
info() { echo -e "${CYAN}  →  $*${RESET}"; }

echo -e "\n${BOLD}AI Builder — Deployment Setup Helper${RESET}"
echo "================================================"

# --------------------------------------------------------------------------
# 1. Check required tools
# --------------------------------------------------------------------------
echo -e "\n${BOLD}Checking required tools...${RESET}"

check_tool() {
  if command -v "$1" &>/dev/null; then
    ok "$1 found ($(command -v "$1"))"
  else
    fail "$1 not found — please install it before continuing"
    exit 1
  fi
}

check_tool node
check_tool npm
check_tool wrangler
check_tool openssl

NODE_VERSION=$(node -e "process.stdout.write(process.version.slice(1).split('.')[0])")
if [ "$NODE_VERSION" -ge 20 ]; then
  ok "Node.js version $NODE_VERSION (>= 20)"
else
  warn "Node.js version $NODE_VERSION found; 20+ is recommended"
fi

# --------------------------------------------------------------------------
# 2. Validate wrangler.toml placeholders
# --------------------------------------------------------------------------
echo -e "\n${BOLD}Checking wrangler.toml...${RESET}"

WRANGLER_TOML="$(dirname "$0")/../wrangler.toml"
if [ ! -f "$WRANGLER_TOML" ]; then
  fail "wrangler.toml not found at $WRANGLER_TOML"
  exit 1
fi

if grep -q "REPLACE_WITH_D1_DATABASE_ID" "$WRANGLER_TOML"; then
  fail "wrangler.toml still contains placeholder D1 database_id"
  info "Run: wrangler d1 create ai-builder  and paste the database_id into wrangler.toml"
else
  ok "D1 database_id is set"
fi

if grep -q "REPLACE_WITH_KV_NAMESPACE_ID" "$WRANGLER_TOML"; then
  fail "wrangler.toml still contains placeholder KV namespace id"
  info "Run: wrangler kv namespace create ai-builder-sessions  and paste the id into wrangler.toml"
else
  ok "KV namespace id is set"
fi

# --------------------------------------------------------------------------
# 3. Validate .dev.vars for local development
# --------------------------------------------------------------------------
echo -e "\n${BOLD}Checking .dev.vars (local development)...${RESET}"

DEV_VARS="$(dirname "$0")/../.dev.vars"
if [ ! -f "$DEV_VARS" ]; then
  warn ".dev.vars not found — local development will not work"
  info "Run: cp .env.example .dev.vars  and fill in real values"
else
  ok ".dev.vars exists"

  check_var() {
    local var="$1"
    local placeholder="$2"
    local value
    value=$(grep "^${var}=" "$DEV_VARS" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true)
    if [ -z "$value" ]; then
      warn "$var is not set in .dev.vars"
    elif echo "$value" | grep -q "$placeholder"; then
      warn "$var still contains placeholder value in .dev.vars"
    else
      ok "$var is set"
    fi
  }

  check_var "APP_URL"               "your-app-url"
  check_var "GITHUB_CLIENT_ID"      "your-github-client-id"
  check_var "GITHUB_CLIENT_SECRET"  "your-github-client-secret"
  check_var "JWT_SECRET"            "replace-with"
  check_var "SETTINGS_ENCRYPTION_SECRET" "replace-with"
fi

# --------------------------------------------------------------------------
# 4. Check Wrangler authentication
# --------------------------------------------------------------------------
echo -e "\n${BOLD}Checking Wrangler authentication...${RESET}"

if wrangler whoami &>/dev/null; then
  WRANGLER_USER=$(wrangler whoami 2>&1 | grep -oP '(?<=You are logged in with an )\S+' || true)
  ok "Wrangler is authenticated${WRANGLER_USER:+ as $WRANGLER_USER}"
else
  warn "Wrangler is not authenticated — run: wrangler login"
fi

# --------------------------------------------------------------------------
# 5. Generate random secrets (optional)
# --------------------------------------------------------------------------
echo -e "\n${BOLD}Generate random secrets?${RESET}"
echo "  These are safe to use for JWT_SECRET and SETTINGS_ENCRYPTION_SECRET."
printf "  Generate new secrets? [y/N] "
read -r GENERATE_SECRETS

if [[ "$GENERATE_SECRETS" =~ ^[Yy]$ ]]; then
  JWT_SECRET_VAL=$(openssl rand -hex 32)
  ENC_SECRET_VAL=$(openssl rand -hex 32)
  echo -e "\n  ${BOLD}JWT_SECRET${RESET}"
  echo "  $JWT_SECRET_VAL"
  echo -e "\n  ${BOLD}SETTINGS_ENCRYPTION_SECRET${RESET}"
  echo "  $ENC_SECRET_VAL"
  echo -e "\n  ${YELLOW}Save these values — they will not be shown again.${RESET}"
  info "Set them with: wrangler secret put JWT_SECRET  (then paste the value)"
fi

# --------------------------------------------------------------------------
# 6. Summary checklist
# --------------------------------------------------------------------------
echo -e "\n${BOLD}Deployment Checklist${RESET}"
echo "================================================"
echo "  [ ] wrangler.toml — D1 database_id updated"
echo "  [ ] wrangler.toml — KV namespace id updated"
echo "  [ ] GitHub OAuth App created with correct callback URL"
echo "  [ ] wrangler secret put APP_URL"
echo "  [ ] wrangler secret put GITHUB_CLIENT_ID"
echo "  [ ] wrangler secret put GITHUB_CLIENT_SECRET"
echo "  [ ] wrangler secret put JWT_SECRET"
echo "  [ ] wrangler secret put SETTINGS_ENCRYPTION_SECRET"
echo "  [ ] CLOUDFLARE_API_TOKEN added to GitHub repository secrets"
echo "  [ ] CLOUDFLARE_ACCOUNT_ID added to GitHub repository secrets"
echo ""
echo "  Once all boxes are checked, deploy with:"
echo -e "  ${CYAN}npm run deploy${RESET}"
echo -e "  or push to ${CYAN}main${RESET} to trigger the GitHub Actions workflow."
echo ""
