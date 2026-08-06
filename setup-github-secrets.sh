#!/usr/bin/env bash
#
# Prompt for local GitHub OAuth/Better Auth credentials and the four production
# Worker secrets, then store them where the account system expects them. Never
# echoes a secret, never passes one as a command-line argument (so nothing reaches shell
# history or `ps`), and writes no temporary files.
#
#   ./setup-github-secrets.sh            # both local and production
#   ./setup-github-secrets.sh --local    # local development only
#   npm run production:bootstrap         # one-time production bootstrap
#
# Two OAuth apps are required because a GitHub OAuth app accepts exactly one
# callback URL:
#
#   local       http://localhost:5173/api/auth/callback/github
#   production  https://agentic-ready-gh-600.timothy-barreto.workers.dev/api/auth/callback/github
#
# Production values come from the password manager. POSTGRES_CONNECTION_STRING
# is the pooled Neon connection used by the runtime; the direct migration
# connection is deliberately not installed as a Worker secret.
#
set -euo pipefail

APPHOST="${APPHOST:-backend/src/Acn.Fde.Practice.AppHost}"
WORKER_NAME="agentic-ready-gh-600"

do_local=true
do_prod=true
case "${1:-}" in
  --local) do_prod=false ;;
  --prod)  do_local=false ;;
  "")      ;;
  *) echo "usage: $0 [--local|--prod]" >&2; exit 2 ;;
esac

cd "$(dirname "$0")"
[ -f wrangler.jsonc ] || { echo "error: run this from the repository root" >&2; exit 1; }

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*"; }

# Prompt for a value. $3 = "hidden" to suppress echo. Re-asks while empty.
ask() {
  local __var=$1 __prompt=$2 __hidden=${3:-} __value=""
  while [ -z "$__value" ]; do
    if [ "$__hidden" = hidden ]; then
      read -rsp "  $__prompt: " __value; echo
    else
      read -rp "  $__prompt: " __value
    fi
    [ -z "$__value" ] && warn "  (required)"
  done
  printf -v "$__var" '%s' "$__value"
}

# ---------------------------------------------------------------- local

if $do_local; then
  say "Development OAuth app — ACN FDE Practice (local)"

  if [ ! -d "$APPHOST" ]; then
    warn "  The Aspire AppHost does not exist yet ($APPHOST)."
    warn "  There is nowhere to put local secrets until it is built."
    warn "  Keep the dev client ID and secret in your password manager and"
    warn "  re-run this script with --local once the AppHost is in place."
    do_local=false
  fi
fi

if $do_local; then
  ask LOCAL_ID          "GitHub dev client ID                 "
  ask LOCAL_SECRET      "GitHub dev client secret             " hidden
  ask LOCAL_AUTH_SECRET "Better Auth secret (32+ characters)" hidden

  if [ "${#LOCAL_AUTH_SECRET}" -lt 32 ]; then
    unset LOCAL_ID LOCAL_SECRET LOCAL_AUTH_SECRET
    echo "error: local Better Auth secret must contain at least 32 characters" >&2
    exit 1
  fi

  dotnet user-secrets init --project "$APPHOST" >/dev/null

  # Piped JSON is the only form of `user-secrets set` that keeps values out of
  # argv. python3 does the escaping; the values travel by environment, not args.
  LOCAL_ID="$LOCAL_ID" LOCAL_SECRET="$LOCAL_SECRET" \
    LOCAL_AUTH_SECRET="$LOCAL_AUTH_SECRET" python3 -c '
import json, os
print(json.dumps({
    "Parameters:github-client-id":     os.environ["LOCAL_ID"],
    "Parameters:github-client-secret": os.environ["LOCAL_SECRET"],
    "Parameters:better-auth-secret":   os.environ["LOCAL_AUTH_SECRET"],
}))' | dotnet user-secrets set --project "$APPHOST" >/dev/null

  unset LOCAL_ID LOCAL_SECRET LOCAL_AUTH_SECRET
  echo "  stored in .NET user-secrets for $APPHOST"
  echo "  keys: Parameters:github-client-id, Parameters:github-client-secret,"
  echo "        Parameters:better-auth-secret"
  warn "  note: user-secrets is unencrypted plaintext under ~/.microsoft/usersecrets/"
fi

# ----------------------------------------------------------------- prod

if $do_prod; then
  say "Production Worker secrets — ACN FDE Practice"
  echo "  Target Worker: $WORKER_NAME"

  installed_secrets="$(npx wrangler secret list --name "$WORKER_NAME" --format json)"
  has_worker_secret() {
    local name=$1
    WORKER_SECRETS="$installed_secrets" node -e '
const secrets = JSON.parse(process.env.WORKER_SECRETS)
process.exit(secrets.some(secret => secret.name === process.argv[1]) ? 0 : 1)
' "$name"
  }

  missing_secrets=()
  for name in GITHUB_CLIENT_ID GITHUB_CLIENT_SECRET BETTER_AUTH_SECRET POSTGRES_CONNECTION_STRING; do
    if has_worker_secret "$name"; then
      echo "  already configured: $name"
    else
      missing_secrets+=("$name")
    fi
  done

  if [ "${#missing_secrets[@]}" -eq 0 ]; then
    echo "  all required Worker secrets are already configured"
    do_prod=false
  else
    warn "  Missing: ${missing_secrets[*]}"
    warn "  Each new secret creates and deploys a Worker version (same code)."
    read -rp "  Continue? [y/N] " reply
    case "$reply" in
      [yY]*) ;;
      *) echo "  skipped"; do_prod=false ;;
    esac
  fi
fi

if $do_prod; then
  PROD_ID=""
  PROD_SECRET=""
  BETTER_AUTH_SECRET=""
  POSTGRES_CONNECTION=""

  has_worker_secret GITHUB_CLIENT_ID || ask PROD_ID "GitHub prod client ID              "
  has_worker_secret GITHUB_CLIENT_SECRET || ask PROD_SECRET "GitHub prod client secret          " hidden
  has_worker_secret BETTER_AUTH_SECRET || ask BETTER_AUTH_SECRET "Better Auth secret (32+ characters)" hidden
  has_worker_secret POSTGRES_CONNECTION_STRING || ask POSTGRES_CONNECTION "Pooled PostgreSQL connection string" hidden

  validation_failed=false
  if [ -n "$BETTER_AUTH_SECRET" ] && [ "${#BETTER_AUTH_SECRET}" -lt 32 ]; then
    echo "error: BETTER_AUTH_SECRET must contain at least 32 characters" >&2
    validation_failed=true
  fi

  if [ -n "$POSTGRES_CONNECTION" ] && \
     ! printf '%s' "$POSTGRES_CONNECTION" | node scripts/production/validate-runtime-connection.ts; then
    echo "error: POSTGRES_CONNECTION_STRING must use the pooled endpoint and required Npgsql settings" >&2
    validation_failed=true
  fi

  if $validation_failed; then
    unset PROD_ID PROD_SECRET BETTER_AUTH_SECRET POSTGRES_CONNECTION
    exit 1
  fi

  # Wrangler reads each value from stdin when it is not a terminal, so no
  # secret is an argument or needs a temporary file. Values are all validated
  # before the first Worker version is changed.
  if [ -n "$PROD_ID" ]; then
    printf '%s' "$PROD_ID" | npx wrangler secret put GITHUB_CLIENT_ID --name "$WORKER_NAME"
  fi
  if [ -n "$PROD_SECRET" ]; then
    printf '%s' "$PROD_SECRET" | npx wrangler secret put GITHUB_CLIENT_SECRET --name "$WORKER_NAME"
  fi
  if [ -n "$BETTER_AUTH_SECRET" ]; then
    printf '%s' "$BETTER_AUTH_SECRET" | npx wrangler secret put BETTER_AUTH_SECRET --name "$WORKER_NAME"
  fi
  if [ -n "$POSTGRES_CONNECTION" ]; then
    printf '%s' "$POSTGRES_CONNECTION" | npx wrangler secret put POSTGRES_CONNECTION_STRING --name "$WORKER_NAME"
  fi

  unset PROD_ID PROD_SECRET BETTER_AUTH_SECRET POSTGRES_CONNECTION
  echo
  npx wrangler secret list --name "$WORKER_NAME"
  warn "  note: Cloudflare shows names only — these values can be replaced, never read back."
fi

say "Done."
