#!/usr/bin/env bash
#
# Prompt for the GitHub OAuth app credentials and store them where the plan says
# they belong. Never echoes a secret, never passes one as a command-line argument
# (so nothing reaches shell history or `ps`), and writes no temporary files.
#
#   ./setup-github-secrets.sh            # both local and production
#   ./setup-github-secrets.sh --local    # local development only
#   ./setup-github-secrets.sh --prod     # production only
#
# Two OAuth apps are required because a GitHub OAuth app accepts exactly one
# callback URL:
#
#   local       http://localhost:5173/api/auth/callback/github
#   production  https://agentic-ready-gh-600.timothy-barreto.workers.dev/api/auth/callback/github
#
# NOT handled here, deliberately — see issue #35:
#   BETTER_AUTH_SECRET             generate with `openssl rand -base64 32`
#   POSTGRES_CONNECTION_STRING     from the Neon console, once it exists
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
  ask LOCAL_ID     "GitHub dev client ID    "
  ask LOCAL_SECRET "GitHub dev client secret" hidden

  dotnet user-secrets init --project "$APPHOST" >/dev/null

  # Piped JSON is the only form of `user-secrets set` that keeps values out of
  # argv. python3 does the escaping; the values travel by environment, not args.
  LOCAL_ID="$LOCAL_ID" LOCAL_SECRET="$LOCAL_SECRET" python3 -c '
import json, os
print(json.dumps({
    "Parameters:github-client-id":     os.environ["LOCAL_ID"],
    "Parameters:github-client-secret": os.environ["LOCAL_SECRET"],
}))' | dotnet user-secrets set --project "$APPHOST" >/dev/null

  unset LOCAL_ID LOCAL_SECRET
  echo "  stored in .NET user-secrets for $APPHOST"
  echo "  keys: Parameters:github-client-id, Parameters:github-client-secret"
  warn "  note: user-secrets is unencrypted plaintext under ~/.microsoft/usersecrets/"
fi

# ----------------------------------------------------------------- prod

if $do_prod; then
  say "Production OAuth app — ACN FDE Practice"
  echo "  Target Worker: $WORKER_NAME"
  warn "  Each secret creates and deploys a new Worker version (same code)."

  read -rp "  Continue? [y/N] " reply
  case "$reply" in
    [yY]*) ;;
    *) echo "  skipped"; do_prod=false ;;
  esac
fi

if $do_prod; then
  ask PROD_ID     "GitHub prod client ID    "
  ask PROD_SECRET "GitHub prod client secret" hidden

  # wrangler reads the value from stdin when it is not a terminal, so the secret
  # is never an argument and is never prompted for twice.
  printf '%s' "$PROD_ID"     | npx wrangler secret put GITHUB_CLIENT_ID     --name "$WORKER_NAME"
  printf '%s' "$PROD_SECRET" | npx wrangler secret put GITHUB_CLIENT_SECRET --name "$WORKER_NAME"

  unset PROD_ID PROD_SECRET
  echo
  npx wrangler secret list --name "$WORKER_NAME"
  warn "  note: Cloudflare shows names only — these values can be replaced, never read back."
fi

say "Done."
