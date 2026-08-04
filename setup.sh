#!/usr/bin/env bash
# =============================================================================
# DayFlow AI - one-shot local setup (macOS / Linux)
#
#   chmod +x setup.sh && ./setup.sh
#
# Installs dependencies and produces a working .env.local with the secrets that
# can be generated locally. The four Supabase values cannot be generated - they
# come from your project - so the script prints exactly where to find them and
# stops rather than pretending it finished.
# =============================================================================

set -euo pipefail
cd "$(dirname "$0")"

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; RED='\033[0;31m'; OFF='\033[0m'
step() { printf "\n${CYAN}==> %s${OFF}\n" "$1"; }
ok()   { printf "    ${GREEN}%s${OFF}\n" "$1"; }
warn() { printf "    ${YELLOW}%s${OFF}\n" "$1"; }
fail() { printf "${RED}%s${OFF}\n" "$1"; exit 1; }

# --- 1. Node ---------------------------------------------------------------
step "Checking Node.js"

command -v node >/dev/null 2>&1 || fail \
"Node.js is not installed or not on PATH.
Install Node.js 20.9 or newer from https://nodejs.org, or with a version manager:
    nvm install 20 && nvm use 20"

NODE_VERSION="$(node -v | sed 's/^v//')"
NODE_MAJOR="${NODE_VERSION%%.*}"
NODE_MINOR="$(echo "$NODE_VERSION" | cut -d. -f2)"

if [ "$NODE_MAJOR" -lt 20 ] || { [ "$NODE_MAJOR" -eq 20 ] && [ "$NODE_MINOR" -lt 9 ]; }; then
  fail "Node $NODE_VERSION found, but 20.9 or newer is required."
fi
ok "Node $NODE_VERSION"

# --- 2. Sync folder warning ------------------------------------------------
case "$PWD" in
  *OneDrive*|*Dropbox*|*"Library/Mobile Documents"*)
    step "Sync folder detected"
    warn "This project is inside a file-sync folder."
    warn "node_modules has tens of thousands of files and the sync client will"
    warn "either saturate your upload or corrupt the install midway."
    warn "Moving the project outside the synced folder is strongly recommended."
    printf "    Continue anyway? (y/N) "
    read -r answer
    case "$answer" in [Yy]*) ;; *) exit 1 ;; esac
    ;;
esac

# --- 3. Dependencies -------------------------------------------------------
step "Installing dependencies (a few minutes on first run)"
npm install --no-audit --no-fund
ok "Dependencies installed"

# --- 4. Environment file ---------------------------------------------------
step "Preparing .env.local"

if [ -f .env.local ]; then
  ok ".env.local already exists - leaving it untouched"
else
  cp .env.example .env.local

  # CRON_SECRET: 48 bytes of cryptographic randomness, base64 encoded.
  CRON_SECRET="$(openssl rand -base64 48 | tr -d '\n')"

  # BSD sed (macOS) and GNU sed (Linux) disagree about -i, so write via a temp
  # file instead of trying to detect which one is present.
  python3 - "$CRON_SECRET" <<'PY' 2>/dev/null || sed_fallback=1
import re, sys, pathlib
secret = sys.argv[1]
path = pathlib.Path(".env.local")
text = path.read_text()
text = re.sub(r"^CRON_SECRET=.*$", f"CRON_SECRET={secret}", text, flags=re.M)
path.write_text(text)
PY

  if [ "${sed_fallback:-0}" = "1" ]; then
    warn "Could not write CRON_SECRET automatically. Set it by hand:"
    warn "  CRON_SECRET=$CRON_SECRET"
  fi

  if VAPID_JSON="$(node scripts/generate-vapid-keys.mjs --json 2>/dev/null)"; then
    node - "$VAPID_JSON" <<'JS'
const fs = require("node:fs");
const { publicKey, privateKey } = JSON.parse(process.argv[2]);
let text = fs.readFileSync(".env.local", "utf8");
text = text.replace(/^NEXT_PUBLIC_VAPID_PUBLIC_KEY=.*$/m, `NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}`);
text = text.replace(/^VAPID_PRIVATE_KEY=.*$/m, `VAPID_PRIVATE_KEY=${privateKey}`);
fs.writeFileSync(".env.local", text);
JS
    ok "Generated CRON_SECRET and VAPID key pair"
  else
    warn "Could not generate VAPID keys. Run 'npm run vapid:generate' later."
  fi

  ok "Created .env.local"
fi

# --- 5. What is still needed ----------------------------------------------
step "Setup complete - four values still needed"

cat <<'TEXT'

    These cannot be generated. Get them from your Supabase project:

      1. Create a project at https://supabase.com
      2. Open Project Settings -> API
      3. Copy into .env.local:

           Project URL      ->  NEXT_PUBLIC_SUPABASE_URL
           anon / public    ->  NEXT_PUBLIC_SUPABASE_ANON_KEY
           service_role     ->  SUPABASE_SERVICE_ROLE_KEY

      4. Apply the schema - either:
           supabase link --project-ref <ref>
           supabase db push
         or paste supabase/migrations/0001..0012 into the SQL editor in order.

      5. Authentication -> URL Configuration:
           Site URL:       http://localhost:3000
           Redirect URLs:  http://localhost:3000/auth/callback
         Authentication -> Providers -> Email: turn OFF "Confirm email" for now.

    Then start it:

        npm run dev

    Full detail, including troubleshooting, is in README.md.

TEXT
