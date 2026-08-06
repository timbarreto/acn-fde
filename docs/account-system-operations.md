# Account-system operator guide

This runbook covers the optional Worker, Better Auth, CoreEx, PostgreSQL, and
production Container path. Standalone guest development remains `npm run dev`
and needs none of these services.

The enforced production identities and tool versions live in
[`scripts/production/production-target.json`](../scripts/production/production-target.json).
Do not copy them into a second deployment configuration.

## Architecture

The Cloudflare Worker is the single public origin. It serves Vite assets, runs
Better Auth against D1 under `/api/auth/*`, and sends the remaining `/api/*`
requests to one CoreEx Container. CoreEx validates short-lived ES256 identity
tokens and stores practice state in PostgreSQL. The Container is stateless,
uses the non-root .NET runtime on port 8080, and sleeps after five minutes.

Production `/health*` routes are private by construction. Local and isolated
stacks route them to CoreEx; production does not, so an anonymous probe cannot
keep the Container and PostgreSQL awake.

## Prerequisites

Use the exact Node and .NET SDK versions pinned by `.nvmrc` and `global.json`,
the committed npm lockfile, and Podman. The production scripts additionally
require Wrangler authentication for the Cloudflare account named in the target.

```bash
npm ci
dotnet restore backend/Acn.Fde.Practice.slnx
node --version
dotnet --version
npx --no-install wrangler --version
```

## Local GitHub OAuth and full-stack development

Create a development GitHub OAuth app with this callback:

```text
http://localhost:5173/api/auth/callback/github
```

Store its client ID and secret plus a random Better Auth secret of at least 32
characters through the repository helper:

```bash
./setup-github-secrets.sh --local
```

The helper sends values to the AppHost's .NET user-secrets without placing them
in command arguments or repository files. User-secrets are unencrypted
plaintext under `~/.microsoft/usersecrets/`; they prevent accidental commits,
not local-disk access. The AppHost exposes only the three named auth values to
the Vite process, and Vite passes only those values into the local Worker
configuration.

Start the persistent development graph:

```bash
npm run dev:full
```

Aspire starts PostgreSQL 18.4, applies PostgreSQL and local D1 migrations, starts
CoreEx, and starts Vite/workerd at `http://localhost:5173`. The normal
Development configuration retains the named PostgreSQL volume and
`.wrangler/state`. Ctrl-C stops processes without deleting either store.

The `Integration` and `Container` AppHost configurations are isolated test
configurations. They use generated test identities instead of GitHub. The
Container configuration builds `backend/Dockerfile`, sets a 1 GiB limit, and
explicitly connects local Aspire telemetry; production keeps telemetry export
disabled.

To reset local full-stack data, stop AppHost, confirm that no needed local data
remains, then remove only the named development stores:

```bash
podman volume rm acn-fde-postgres-data
rm -rf .wrangler/state
```

Never use those commands against an isolated test directory or production.

## Verification

The supported verification commands are:

```bash
npm run test
npm run test:worker
npm run test:backend
npm run test:full
npm run test:deployment
npm run test:resilience
npm run lint
npm run build
```

`test:resilience` is the only command that runs restart and production-image
inspection scenarios. It is intentionally excluded from ordinary CI and all
other test commands. `test:deployment` uses disposable PostgreSQL and local D1
stores and does not contact production. Do not run the Playwright QA suite
unless the operator explicitly requests it.

## One-time production setup

Before the first Container release:

1. Create D1 in ENAM and Neon in an ENAM-compatible AWS region. Pin Neon's Free
   compute minimum and maximum to 0.25 CU.
2. Create a separate production GitHub OAuth app with callback
   `https://agentic-ready-gh-600.timothy-barreto.workers.dev/api/auth/callback/github`.
   GitHub OAuth apps cannot hold both this and the local callback.
3. Authenticate Wrangler and establish rollback-compatible Durable Object
   history before installing secrets:

   ```bash
   npm run production:prime -- --dry-run
   npm run production:prime
   npm run production:bootstrap
   ```

`production:bootstrap` installs only missing Worker secrets:
`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `BETTER_AUTH_SECRET`, and the pooled
`POSTGRES_CONNECTION_STRING`. It validates all values before the first write.
Each `wrangler secret put` creates a Worker version, so rotation is a separate
maintenance operation. Cloudflare reveals secret names but never values.

Keep the direct Neon migration connection in the password manager. It is not a
Worker secret. Both Neon connection strings use ADO.NET syntax and certificate
verification; runtime traffic uses the `-pooler` host while migrations use the
direct host.

## Production release

A release is operator-initiated and must start from clean `main` with
`HEAD == origin/main`:

```bash
npm ci
npm run build
npm run production:deploy -- --dry-run
npm run production:deploy
```

Both deployment commands prompt for the direct migration connection without
echoing it. The dry run validates tools, target identities, secret names,
bindings, account-enabled assets, current Worker/Container state, and both
migration ledgers without mutation.

The real command applies additive PostgreSQL migrations first and D1 migrations
second, verifies both native ledgers, builds a commit-tagged Linux AMD64 image,
pushes and resolves its immutable digest, rechecks the active Worker, then uses
an immediate singleton rollout. Frontend assets ship through the Worker's
`ASSETS` binding; there is no separate frontend deployment.

After deployment, the script checks the SPA and anonymous
`GET /api/practice-state` every five seconds for one minute. Healthy production
is HTML `200` plus CoreEx `401`. It intentionally does not probe database
readiness or private `/health*` routes.

## Recovery

Database recovery is always forward-only:

- If a migration fails, leave successful additive migrations in place, repair
  the cause, and rerun. Native ledgers resume at the first pending migration.
- Unknown, reordered, changed, missing, or non-expand migrations stop rollout.
- A concurrent Worker change after preflight stops application deployment.

Application recovery uses the Worker version and Container digest captured by
preflight. A partial first rollout removes the partial Container application
and restores the primed Worker. A later partial rollout restores the retained
Container digest and Worker version. Database migrations are never reversed.
`containers info` is authoritative for convergence; `containers list` can lag.

A completed release that fails the one-minute health observation remains active
and exits nonzero for repair-forward diagnosis. Health failure never triggers an
automatic rollback.

## Troubleshooting

- **Sign-in is disabled locally:** use `npm run dev:full`, not standalone
  `npm run dev`, and configure local user-secrets. If an older Vite process owns
  port 5173, stop it and restart AppHost; otherwise the browser can reach the
  guest-only process instead of Aspire's fixed endpoint. Production assets must
  be built through `production:deploy`, which forces account mode rather than
  trusting an older `dist/` directory.
- **GitHub rejects `redirect_uri`:** verify the exact OAuth app and callback.
  Version-preview URLs cannot authenticate and are guest/UI previews only.
- **Callback returns to Account with an error:** confirm D1 migrations are
  current, the three GitHub/Better Auth secret names exist, and the provider
  profile contains the required GitHub account ID. Private public email is
  supported through GitHub's `/user/emails` response.
- **Sign-in succeeds locally but sync returns `401`:** inspect the AppHost
  Development configuration, not a launch profile. It explicitly injects the
  localhost issuer, audience, JWKS URL, and non-HTTPS local setting because
  Aspire starts CoreEx with `--no-launch-profile`.
- **The first account request is slow:** a sleeping Container and Neon compute
  normally take several seconds to wake. Local edits remain optimistic and
  retryable.
- **Anonymous practice-state request returns `401`:** this is the expected live
  production response and proves the request reached CoreEx.
- **Neon migration startup rejects a missing database parameter:** use the
  committed database tool. Its production migration verifies the configured
  existing database directly instead of attempting a database-less server
  check.
- **Container image appears stale:** wait for `containers info` to report the
  immutable digest. Do not treat the eventually consistent list response as
  rollout completion.
- **Account deletion stops halfway:** practice state has already been deleted.
  Return to Account and retry only identity deletion; do not restore or resend
  old practice data.

## Cost alerts and limits

The expected baseline is the Workers Paid minimum. The main variable is the
basic Container's awake time: one 1 GiB instance consumes the included 25
GiB-hours in about 25 awake hours. Singleton routing, `max_instances: 1`,
`instance_type: "basic"`, and five-minute sleep are cost controls.

Create Cloudflare budget alerts manually under **Manage Account → Billing →
Billable Usage** (the design uses US$8 and US$15 thresholds), and configure a
Neon spend alert when moving to Launch. **Alerts are informational only. They do
not pause services, cap usage, or prevent charges.** Cloudflare has no supported
hard billing ceiling for this deployment, and `limits.cpu_ms` is not one.
Avoid scheduled health probes or readiness polling: either can keep the
Container and database awake and turn expected sleep into billable idle time.
