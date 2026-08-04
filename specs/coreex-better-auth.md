# ACN FDE CoreEx backend and Better Auth plan

> **Status: approved specification, not yet implemented.** This document
> records the approved design for a CoreEx-based backend and Better Auth
> authentication layer. It describes target architecture and an ordered
> implementation checklist; none of the described code, infrastructure, or
> configuration exists in this repository yet. See [`AGENTS.md`](../AGENTS.md)
> for the current (client-only) architecture, which remains authoritative
> until this plan is implemented.

## Context

ACN FDE is currently a client-only React 19/Vite application with all practice state stored in browser `localStorage`; its project guidance explicitly says there is no backend, API, database, or account system.
The requested change introduces a CoreEx-based backend and Better Auth authentication while preserving guest/offline use. The selected design is a roughly US$5/month Cloudflare-centric deployment, with GitHub-only sign-in and an idempotent newest-wins merge of a guest's existing practice state on their first sync.

### Vocabulary

This document uses the terms defined in [`CONTEXT.md`](../CONTEXT.md), settled by [#51](https://github.com/timbarreto/acn-fde/issues/51). Several are deliberately narrower than everyday usage, and four earlier drafts of this spec used them loosely enough to hide modelling errors:

| Concept | Name here | Currently in `src/` | Retired wording |
|---|---|---|---|
| A person practising | **candidate** | — | "user" for anyone |
| Signed-in identity | **user**, keyed by **subject** (`sub`) | — | "user" meaning a guest too |
| Everything remembered about practising | **practice state** | `PersistedState` | "snapshot", "progress", "save data" |
| That, plus schema version and receipts | **practice state envelope** | — | "snapshot" |
| One sitting | **attempt** (`Attempt`), ended as a **finished attempt** | `ActiveAttempt` / `CompletedAttempt` | "completed attempt" for all endings |
| The answer of record per question | **latest answers** | `progress` | "progress" |
| Derived statistics | **progress**, **readiness** | (computed) | — |
| Server arrival time per item | **receipt** (`receivedAt`) | — | "sync metadata", "updatedAt", "version" |
| One client↔server exchange | **sync** | — | "import", "upload", "push" |
| A database backup | **snapshot** | — | (reserved for this meaning only) |

Two rules that are easy to violate without noticing. **A guest is never a user** — ownership derives from `sub` alone, so no synthetic guest identifier may ever exist. And **no stored value records when a candidate acted**: receipts record server arrival, and only `startedAt`/`finishedAt` describe candidate activity, so nothing in a candidate-facing view may label a receipt "last answered".

## Approach

### Deployment topology

Evolve the existing Cloudflare static-assets Worker into the single same-origin entry point:

- `/api/auth/*` runs a small TypeScript Better Auth service with GitHub as the only provider and D1 for auth/session/JWKS tables. This requires `compatibility_flags: ["nodejs_compat"]` and `assets.run_worker_first: ["/api/*"]` in `wrangler.jsonc`; without the latter the OAuth callback is served `index.html` and never reaches the Worker (see the authentication contract).
- `/api/*` forwards to one stateless CoreEx ASP.NET API in a Cloudflare `basic` Container (1 GiB / ¼ vCPU / 4 GB disk), configured to sleep after 5 minutes of inactivity. Containers reached GA on 13 April 2026 and require Workers Paid; there is no other gating. Both values must be set **explicitly** — `instance_type` defaults to `lite` (256 MiB) and `sleepAfter` defaults to `"10m"` ([#36](https://github.com/timbarreto/acn-fde/issues/36)).
- All other requests continue to use the existing Vite `dist/` static-assets binding and SPA fallback.
- The CoreEx container uses a free-tier managed PostgreSQL database (Neon Free) because PostgreSQL is a supported CoreEx template path and D1 is not a native .NET/CoreEx provider. Neon is confirmed as the choice rather than Supabase (whose free tier pauses after ~7 days of low activity and requires a *manual* dashboard resume) or an always-on managed instance (whose ~US$15/month floor breaks the cost posture). See [#38](https://github.com/timbarreto/acn-fde/issues/38).

#### PostgreSQL configuration constraints

These are not preferences; each one prevents a specific failure ([#38](https://github.com/timbarreto/acn-fde/issues/38)):

- **Co-locate the container and the database.** Containers run nearest the *incoming request* by default and can restart on another continent, while a Neon project's region is immutable after creation. Set container `constraints.regions` to `["ENAM"]` and create the Neon project in `aws-us-east-1`/`aws-us-east-2`.
- **Pin Neon's autoscale maximum to 0.25 CU.** The Free plan allows autoscaling to 2 CU, which can burn the 100 CU-hour monthly budget up to 8x faster. Exhausting CU-hours suspends compute *until the next billing period* — a hard outage with no pay-through option.
- **Nothing may hold the database awake.** No scheduled polling of a readiness endpoint that touches PostgreSQL, Npgsql `Keepalive` disabled, no logical replication. A continuously-awake 0.25 CU compute costs ~182 CU-hours/month and suspends around day 16.
- **Connection string:** application traffic uses the pooled `-pooler` endpoint (PgBouncer, transaction mode); migrations and `pg_dump` use the direct endpoint — the two hostnames differ only by that suffix and share one role password. Npgsql settings: `Maximum Pool Size=10`, `Minimum Pool Size=0`, `Connection Idle Lifetime=240` (**must** be below Neon's 300 s suspend, or Npgsql hands out sockets Neon has already torn down), `Timeout=15`, `Keepalive` disabled, `SSL Mode=VerifyFull`, `Channel Binding=Require`, `GSS Encryption Mode=Disable`, and `No Reset On Close=true` on the pooled endpoint. **`GSS Encryption Mode=Disable` is not optional housekeeping** ([#41](https://github.com/timbarreto/acn-fde/issues/41)): Npgsql 10 defaults to `Prefer`, and .NET's official container images dropped the Kerberos libraries in .NET 8, so every start logs `Cannot load library libgssapi_krb5.so.2` to stderr before silently falling back. Setting it removes a recurring error that reads like a TLS failure and is not one. Enable EF Core `EnableRetryOnFailure` so a wake-race retries rather than 500s.
- **Neon hands out a libpq URI, which Npgsql cannot parse** ([#35](https://github.com/timbarreto/acn-fde/issues/35)). The console gives `postgresql://user:password@host/db?sslmode=require&channel_binding=require`; `AddNpgsqlDataSource("Postgres")` expects ADO.NET keyword syntax (`Host=…;Database=…;Username=…;Password=…;`) and fails at startup on the URI form. Convert it when storing the secret, not at runtime. Note also that pasting Neon's default carries `sslmode=require`, which encrypts but does **not** verify the server certificate — the settings above deliberately upgrade this to `VerifyFull`.
- **`VerifyFull` needs no CA bundle in the image.** Verified by connecting to both endpoints with full certificate validation: Neon's certificate chains to a publicly trusted root, so the container requires no custom root store.
- **`pg_stat_ssl` reports `ssl = false` on Neon** even when the client connection is TLS-encrypted and certificate-verified, because Neon's proxy terminates TLS and the backend sees a plaintext internal hop. Health checks, audits, and tests must never assert `pg_stat_ssl.ssl = true` — on Neon it is a false alarm, not a security finding.
- **Raw TCP egress is load-bearing.** Cloudflare Containers permit outbound port-5432 TCP+TLS by default (`enableInternet` defaults to `true`; outbound handlers only intercept ports 80/443). Neon's serverless driver is JavaScript-only and Hyperdrive cannot reach a container, so ordinary Npgsql over TCP is the *only* path. The connection string must arrive as a container environment variable / Worker secret, not via Worker-side credential injection.
- **First-request latency after idle is 3–8 seconds.** The full public path was measured on the production shape ([#42](https://github.com/timbarreto/acn-fde/issues/42)): three independent sleep/wake cycles took **3.24 s, 3.38 s, and 5.16 s**, while warm readiness had a 0.43 s median. Every wake restored PostgreSQL connectivity and discarded container-local state. This is tolerable *only* because account mode uses optimistic local updates and retryable sync — the candidate never waits on the cold path. Do not weaken that property. Never run EF Core migrations at container start.
- **Server version is PostgreSQL 18.4.** Neon provisions this today ([#35](https://github.com/timbarreto/acn-fde/issues/35)); the Aspire-provisioned local PostgreSQL must be pinned to the same major version so development does not run against an older engine than production.
- **Planned upgrade path:** Neon Launch is a plan flip, not a migration — same project, same hostname, same code — and removes both the suspension cliff and the 6-hour recovery window. It carries **no monthly minimum**: pay-as-you-go at $0.106/CU-hour plus $0.35/GB-month, which at this volume is roughly **US$0.85/month** ([#35](https://github.com/timbarreto/acn-fde/issues/35)). Flip it when real user data lands or CU-hours cross ~60% of the cap, and configure a Neon spend alert — noting that **Cloudflare offers no equivalent**, so there is no "billing limit" to set alongside it (see the cost model below).

#### Container configuration and the real cost model

The meter that binds is the **container's provisioned memory**, which the original plan did not name ([#36](https://github.com/timbarreto/acn-fde/issues/36)). Workers Paid includes 25 GiB-hours/month, and a 1 GiB `basic` instance consumes that in **~25 awake hours — roughly 50 minutes a day**. Memory and disk bill on *provisioned* resources for every 10 ms the container is awake; only CPU bills on actual use. The US$5 is a **minimum charge, not a credit pool**: overages are added on top.

| Usage pattern | Awake hours/month | Total monthly |
|---|---|---|
| ~300 isolated wakes of 5 min each | 25 | **US$5.00** |
| ~30 min of real use per day | ~18 | **US$5.00** |
| 100 awake hours (~3.3 h/day) | 100 | ~US$5.73 |
| Never sleeps, idle CPU | 730 | ~US$12.03 |

The cost does not blow up; it drifts at roughly US$0.010 per awake hour past the allowance. **The whole US$5 posture therefore depends on the container genuinely sleeping** — any SPA polling, uptime check, or browser keep-alive that renews the activity timer silently converts this into a ~US$12/month deployment.

Required configuration, beyond `instance_type` and `sleepAfter` above:

- **Routing must be an explicit singleton** — `getContainer(env.COREEX, "api")` with `max_instances: 1`. Containers have **no autoscaling**, and `max_instances` defaults to 20. A singleton also keeps memory-hours and Durable Object duration at exactly 1×.
- **One Durable Object per container instance, billed separately.** A single always-awake instance stays inside the included 400,000 GB-s of DO duration but consumes ~84% of it, because the Container DO deliberately remains non-hibernateable while the container runs. A *second* always-awake instance would breach the allowance — another reason for the singleton.
- **Set `constraints.regions`** as the PostgreSQL section requires; instances otherwise restart in a different datacenter each wake.
- **Egress cannot be locked down.** `enableInternet = false` or an `allowedHosts` allowlist would deny port 5432 outright, since outbound policy covers only ports 80/443. Open egress is the price of native Postgres; authentication is the only perimeter.

Adjacent meters stay comfortably inside included allowances: static-asset requests are free and unlimited, Workers include 10 M requests/month, D1 includes 25 B rows read, and container egress includes 1 TB/month for North America and Europe. Monitor **awake hours** as the primary cost signal. Do not try to host ASP.NET directly in the Workers runtime or persist data on the container's ephemeral disk.

**Cloudflare can alert on spend but cannot cap it** ([#35](https://github.com/timbarreto/acn-fde/issues/35)). **Budget alerts** — Manage Account → Billing → Billable Usage → *Create budget alert* — email when account-wide usage-based spend crosses a dollar threshold, and are available to pay-as-you-go accounts regardless of zone plan. They are explicitly **informational only: they do not pause or cap usage**, and Cloudflare documents no API for creating them, so they are configured by hand. (The separate `billing_usage_alert` notification policy, which *is* API-creatable at `POST /accounts/{id}/alerting/v3/policies`, is documented as Professional-plan-or-higher and watches a product metric rather than dollars.)

So there is no ceiling, no way to make the account stop rather than bill, and `limits.cpu_ms` bounds CPU time rather than spend. Every real cost guardrail in this design is *configuration* — `max_instances: 1`, an explicit `instance_type`, an explicit `sleepAfter`, and singleton routing — and an error in any of them is billed, not blocked. Budget alerts shorten the time to *notice*, which is why two are set: one at US$8 (drift past the expected ~US$5 baseline) and one at US$15 (consistent with a container that never sleeps). This is the reason those four settings are stated as requirements rather than defaults.

#### ASP.NET constraints inside the container

Nothing prohibits a long-running Kestrel process, but five operational facts must be designed for ([#36](https://github.com/timbarreto/acn-fde/issues/36)). All of them were then measured against a real scaffolded image ([#41](https://github.com/timbarreto/acn-fde/issues/41)), and the instance turns out to be generously sized rather than marginal — **a framework-dependent build on `mcr.microsoft.com/dotnet/aspnet:10.0` is 369 MB, of which the application layer is 22 MB**, against a 4 GB `basic` disk. Neither an Alpine base nor trimming is worth pursuing:

- **Build for `linux/amd64`.** An image built on an ARM machine without `--platform linux/amd64` will not run.
- **Containers run without root**, so Kestrel binds a port above 1024 (the .NET `aspnet` images already default to 8080).
- **Port readiness defaults to 20 s** (`portReadyTimeoutMS`), and this was expected to be the binding risk. **It is not.** The image reaches a passing `/health/live` in **~1.4 s** under exactly `basic`'s limits, leaving 14× headroom ([#41](https://github.com/timbarreto/acn-fde/issues/41)). Raising the timeout and moving to `standard-1` — which would burn the memory allowance 4× faster — are both unnecessary.
- **1 GiB with no swap** — OOM restarts the instance silently, but the measured process holds **~121 MB resident** at idle and after load, about 12% of the instance ([#41](https://github.com/timbarreto/acn-fde/issues/41)). `DOTNET_gcServer=0` and `DOTNET_GCHeapHardLimit` were tested and are **not** worth setting: workstation GC saved 3 MB and cost 0.4 s of startup.
- **Do not publish ReadyToRun.** Tested head-to-head: it added 39 MB to the image and made startup marginally *slower* (1.48 s vs 1.39 s, against a 1.39–1.50 s run-to-run spread). The startup budget is not tight enough to justify it.
- **The disk resets on every sleep.** ASP.NET Core Data Protection persists its key ring to the filesystem by default and would regenerate it on essentially every wake. This is harmless only because all cookie/session state lives in the Better Auth Worker and CoreEx merely validates JWTs against remote JWKS — but Data Protection must be configured deliberately, not left to default.

#### Provisioned resources

Everything below exists ([#35](https://github.com/timbarreto/acn-fde/issues/35)). None of it is wired into `wrangler.jsonc` yet — that is build work.

| Resource | Identity | Notes |
|---|---|---|
| Cloudflare account | `263caf3ee0ff6b4a0b0945a344fd13b1` | **Workers Paid**, the only recurring charge |
| Worker / production origin | `agentic-ready-gh-600` at `https://agentic-ready-gh-600.timothy-barreto.workers.dev` | already deployed as static assets; this is the same-origin front door, not a new Worker |
| D1 | `acn-fde-auth`, `ea5f600d-fc37-4770-a521-87c75de21bf7` | **region ENAM** |
| PostgreSQL | Neon project in `aws-us-east-1`, database `neondb`, role `neondb_owner` | autoscaling pinned to 0.25 CU min *and* max; schema `practice` is created by migration |
| GitHub OAuth apps | two, owned by the personal account `timbarreto` | dev callback `http://localhost:5173/api/auth/callback/github`; production callback on the Worker origin above |

Three facts about this set that are easy to get wrong:

- **`wrangler d1 create` places the database near whoever ran the command**, not near the Worker or the application's other regions. The first attempt landed in WNAM and had to be recreated with `--location enam`. D1 region is fixed at creation.
- **Two GitHub OAuth apps are mandatory, not tidy.** GitHub's documentation states plainly that OAuth apps cannot have multiple callback URLs, unlike GitHub Apps, so one app cannot serve both localhost and production.
- **Version preview URLs (`*-agentic-ready-gh-600.timothy-barreto.workers.dev`) are enabled and public, and sign-in cannot work on them** — those origins match neither OAuth app's single callback URL, so GitHub rejects the `redirect_uri`. Previews remain useful for UI and guest-mode work only. Say so in the README; it will otherwise be diagnosed as a broken auth deployment.

#### Secret locations

No secret value appears in any committed file, issue, or spec; `.gitignore` covers `.dev.vars*` and `.env*` as a backstop. A password manager is the source of truth for everything below, because neither Cloudflare nor GitHub will show a stored secret again.

| Secret | Local development | Production |
|---|---|---|
| GitHub OAuth client ID + secret | AppHost .NET user-secrets, keys `Parameters:github-client-id` / `Parameters:github-client-secret` | Worker secrets `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` |
| `BETTER_AUTH_SECRET` | AppHost .NET user-secrets | Worker secret; rotating it invalidates every existing session |
| PostgreSQL runtime connection string | Aspire-generated local credentials | Pooled endpoint in Worker secret `POSTGRES_CONNECTION_STRING`, forwarded to the container as `ConnectionStrings__Postgres` via the Container Durable Object's `envVars` — the name CoreEx's `AddNpgsqlDataSource("Postgres")` reads |
| PostgreSQL migration connection string | Aspire-generated local credentials | Direct endpoint retained in the password manager and supplied only to the migration child process during a production deployment; never a Worker secret |

`setup-github-secrets.sh` at the repository root prompts for the GitHub credentials and writes them to both destinations without passing any value through `argv` or shell history. Two caveats belong in the README: `dotnet user-secrets` is **unencrypted plaintext** under `~/.microsoft/usersecrets/` — it keeps secrets out of the repository, not off the disk — and each `wrangler secret put` creates and deploys a new Worker version.

### Authentication contract

Keep Better Auth's browser session in a secure, HTTP-only, same-site cookie. Enable Better Auth's JWT/JWKS plugin; after session establishment, the frontend requests a short-lived API JWT and keeps it in memory rather than `localStorage`. The CoreEx API uses ASP.NET `JwtBearer` validation against Better Auth's JWKS and validates signature, issuer, audience, and expiry before mapping `sub` (the stable Better Auth user ID) into CoreEx `ExecutionContext`. Every practice-data query derives ownership from that authenticated subject; no endpoint accepts a user ID from the client. Basic health probes remain anonymous, while detailed diagnostics and data endpoints require authorization.

`sub` **is** the stable Better Auth user ID, so that mapping is sound. The rest of this contract was verified against better-auth 1.6.25 executing on a real D1 binding in workerd ([#37](https://github.com/timbarreto/acn-fde/issues/37)), which exposed two configurations without which the design does not work at all:

- **Pin the signing algorithm to ES256:** `jwt({ jwks: { keyPairConfig: { alg: "ES256" } } })`. Better Auth defaults to **EdDSA/Ed25519** (`kty: OKP`), and `Microsoft.IdentityModel` supports only `EC`/`RSA`/`oct`/`Akp` with no EdDSA algorithm constant — an out-of-the-box `JwtBearer` handler skips the key and **fails every token**.
- **Add `assets.run_worker_first: ["/api/*"]` to `wrangler.jsonc`.** This repo already sets `not_found_handling: "single-page-application"` with a compatibility date past 2025-04-01, which means navigation requests bypass the Worker. GitHub's callback redirect *is* a navigation request, so it would be answered with `index.html` and **sign-in would silently never complete**. Cloudflare's own documentation uses the OAuth callback as the canonical failure case for this.

Further required configuration:

- **`compatibility_flags: ["nodejs_compat"]`** — Better Auth needs `AsyncLocalStorage` and statically imports `node:crypto`; the Worker will not start without it.
- **Trim the JWT payload.** By default the token carries the *entire user object* — email, name, avatar, timestamps — not just `sub`/`iss`/`aud`/`iat`/`exp`. Set `jwt.definePayload` to collapse it to those five claims **plus the GitHub account id**, which the API records as a disaster-recovery key ([#44](https://github.com/timbarreto/acn-fde/issues/44)).
- **Do not persist the GitHub access token.** Better Auth stores it in `account.accessToken`, but nothing in this design ever calls the GitHub API after sign-in, so it is a live credential held for no benefit. Clear it once sign-in completes. (`refreshToken` is always null — GitHub OAuth apps do not issue them.)
- **Allow `POST /api/auth/delete-user`** through `disabledPaths` and the Worker allowlist; self-service account deletion depends on it.
- **Pin `jwt.issuer` and `jwt.audience` explicitly.** Both default to `baseURL` and would therefore differ between development and production. Default expiry is 15 minutes. Issuer is *not* the JWKS URL — in local development the token is issued with `iss = http://localhost:5173`, which is also where the API fetches JWKS, since the Worker shares the Vite port ([#45](https://github.com/timbarreto/acn-fde/issues/45)).
- **There is no OIDC discovery document.** `/.well-known/openid-configuration` returns 404, so ASP.NET cannot use `Authority`/`MetadataAddress`; wire `ConfigurationManager<JsonWebKeySet>` (or an explicit `IssuerSigningKeyResolver`) against `/api/auth/jwks`.
- **Key rotation is off by default** and lazy — it happens on the next signing operation, never on a schedule, `gracePeriod` defaults to 30 days, and old `jwks` rows are never deleted. The planned rotated-key test requires configuring `rotationInterval` first.
- **Restrict the route surface with Better Auth's own `disabledPaths`,** not only the Worker allowlist. About 30 paths are live by default, and `/sign-in/email` and `/sign-up/email` remain registered as 400s despite `emailAndPassword.enabled: false`; `disabledPaths` turns them into genuine 404s.
- **Set `rateLimit.storage: "database"`.** The in-memory default is per-isolate and effectively meaningless in Workers.
- **Handle GitHub users with a private primary email.** `user.email` is `NOT NULL UNIQUE`, but GitHub returns `email: null` for those accounts, producing an `email_not_found` failure on first sign-in. Supply a `mapProfileToUser` fallback that reads `/user/emails`.

On D1 specifically: Better Auth ships a **built-in** `D1SqliteDialect` and auto-detects a raw binding, so `database: env.AUTH_DB` is the whole configuration — no `kysely-d1` or Drizzle, despite the public docs still listing only the community dialect. Pin `better-auth >= 1.6.x`. Note that **D1 has no interactive transactions**, so the first-sign-in writes (`user` + `account` + `session`) are *not* atomic — unlike the PostgreSQL merge path. The first anonymous `GET /jwks` also **writes** a key row rather than being a pure read.

Better Auth generates the `user`/`session`/`account`/`verification`/`jwks` schema exactly as assumed. Because the Better Auth CLI cannot reach D1 (it introspects a live database), produce the committed `migrations/*.sql` out-of-band via `compileMigrations()` or `npx auth@latest generate` against an equivalent local SQLite config, and add a CI drift check so plugin changes cannot silently desynchronise the committed SQL.

### Sign-in as a product decision

Earlier drafts assumed this decision was already made and described only the mechanism. It is now settled explicitly ([#50](https://github.com/timbarreto/acn-fde/issues/50)), because it constrains the frontend far more than the backend. Today's `README.md` lists "No account, API, database, or backend" as a *feature* and the tagline is "offline-first", so introducing accounts changes what the product claims to be, not merely what it stores.

The governing rule is **discoverable, never interruptive**:

- **Sign-in is always available and easy to find, and the app never asks for it.** No modal, no banner, no post-attempt prompt, no periodic "your progress is only on this device" nag — not once, not ever. A user who never signs in is not a lapsed conversion; they are using the product as designed.
- **Guest mode is permanent and first-class.** It is not a trial and not a funnel. Nothing is withheld or degraded, and export and reset are guest features in their own right rather than account perks. This is close to the existing requirement that `npm run dev` stay usable with no backend at all ([#39](https://github.com/timbarreto/acn-fde/issues/39)).
- **The honest pitch is narrow, and keeping it narrow is the point.** Sign-in buys exactly two things: practice that follows you to a second device, and survival of a cleared browser. GitHub as the only provider is unusually well matched — a GH-600 candidate already has a GitHub account — but it is still an identity handed to a practice-exam app, so the ask stays small and unpressured.
- **Signing in never costs the user anything visible.** This is why `latestAnswers` is stored and merged rather than derived; see the merge rules.

#### The `Account` view

A fifth top-level nav item, `Account`, shown to everyone including guests. It hosts sync state, the client-side JSON export, self-service reset, and account deletion ([#44](https://github.com/timbarreto/acn-fde/issues/44)) — the first two of which a guest genuinely owns, which is why the surface cannot be an avatar menu that only exists when signed in.

The trade was made knowingly: top-level placement is more discoverable than a footer or settings link, and it does mean guests carry a permanent account surface they may never use. Discoverability was chosen over quietness. It must not drift into a nag — the page leads with sign-in only because that is where a signed-out user's options begin, and the subject is raised nowhere else in the app.

`Account` is a provisional label pending the glossary ([#51](https://github.com/timbarreto/acn-fde/issues/51)), which has to settle what *account*, *user*, and *guest* mean in a product whose first-class mode has none of them.

#### Sync status

`TopNav` carries an always-visible passive indicator with a deliberately small public state set ([#56](https://github.com/timbarreto/acn-fde/issues/56)):

| Condition | Copy |
|---|---|
| Guest | `Saved on this device` |
| Better Auth session resolution | `Starting…` |
| Token acquisition or a request in flight | `Syncing…` |
| Most recent account state accepted | `Synced just now`, then a relative time |
| Browser offline | `Offline · saved on this device` |
| Online but a retryable failure is blocking replication | `Not synced · saved on this device` |

There is no permanently-failed state, threshold, escalation, or dismissal state, and the indicator is never a modal. It is chrome, not an alert. A permanent rejection restores the last accepted state and uses the one dismissible notification defined by the validation contract instead of adding another indicator state.

This stays out of timed attempts **by construction rather than by discipline**: `ExamRunner` returns early from `App` and renders its own header, so `TopNav` is not mounted during an exam at all. Keep that structure — relocating the indicator into the exam header would put live network status beside a countdown timer.

Note what "not synced" does not mean. A failed sync is not data loss: the local cache holds everything and clients heal the server ([#44](https://github.com/timbarreto/acn-fde/issues/44)), so the condition is *unreplicated*, not *lost*. The copy must say so, or every transient failure reads as a data emergency.

#### Sign-out

Sign-out **erases the account cache from the device** and explains why, leaving an empty guest state with an explanation rather than a bare dashboard. This is the same conservative posture as not retaining the GitHub access token: a practice history is not high-stakes data, but a shared library terminal or classroom machine should not keep the previous user's exam record.

The persistence layer implements sign-out as a strict gate ([#56](https://github.com/timbarreto/acn-fde/issues/56)). If the account state is accepted, it erases that subject's cache and signs out immediately. If any change is pending, it requests an immediate flush and disables sign-out until the server accepts it. A retryable failure leaves the user signed in and explains that sign-out is blocked until syncing succeeds. There is no destructive "discard changes and sign out" bypass.

Because the cache is erased and the guest's practice state is consumed by the first sync after signing in, sign-out does not restore an older guest state. That is deliberate: months-stale practice state reappearing reads as catastrophic loss.

### Persistence and syncing

Extract the current `localStorage` logic from `App.tsx` into one deep, framework-independent persistence/sync module plus a thin React hook ([#56](https://github.com/timbarreto/acn-fde/issues/56)). The UI-facing model keeps its own handwritten type rather than importing generated ones, but it is renamed `PersistedState` -> `PracticeState` so browser, wire, and server all use one word for one concept ([#51](https://github.com/timbarreto/acn-fde/issues/51)).

The module owns legacy migration, storage keys and cache isolation, the schema-v2 envelope, receipts and bookmark tombstones, the local mutation journal, token acquisition, scheduling, retries, canonical-response rebasing, rejection rollback, and cache erasure. It is a plain external store with dependency-injected storage, auth-token, and practice-API adapters. The React hook subscribes with `useSyncExternalStore` and exposes only:

- `practiceState`;
- `updatePracticeState(updater, { flush?: "debounced" | "immediate" })`;
- `syncStatus` and the current dismissible sync notification;
- `flush()`; and
- `signOutSafely()`.

`updatePracticeState` accepts a functional updater. The module compares the receipt-bearing portions before and after the update and records the changed paths and values; `App.tsx` never builds the journal itself. `App.tsx` keeps navigation, attempt UI orchestration, and the decision that an event is a milestone, but it does not know storage keys, receipt rules, tokens, retries, rebasing, or cache cleanup.

#### Cache isolation and the guest-to-account transition

Storage uses one fixed versioned guest key, `agentic-ready-gh600-v2:guest`, and one account key namespaced by the URL-encoded authenticated subject, `agentic-ready-gh600-v2:user:${encodeURIComponent(subject)}`. There is no persisted "current" or "last account" pointer. Until Better Auth resolves the current session, the module renders initialization state and reads no practice cache. It may read only the key derived from the resolved `sub`; it never enumerates account keys to choose one.

Guest mode remains fully local and offline-capable. On first load, read `agentic-ready-gh600-v1` only as a migration source, write the schema-v2 guest envelope, and then remove the legacy key. The legacy shape is never sent to the API. When standalone `npm run dev` has no auth/backend adapter, initialize guest mode and never inspect an account key.

Account mode uses optimistic local updates and retryable synchronization so an auth/API/database outage does not break practice. An unexpected loss of the Better Auth session immediately hides the account state and quarantines its cache until that same subject authenticates again; it neither exposes guest state nor erases the account cache. Only explicit safe sign-out erases that subject's key.

The first sync after sign-in sends the guest envelope to the ordinary state endpoint. **There is no import** — no dedicated operation, `practice_import` table, or correlation id ([#43](https://github.com/timbarreto/acn-fde/issues/43), [#51](https://github.com/timbarreto/acn-fde/issues/51)). The browser continues reading and writing the guest key until it receives a canonical success. It then writes the canonical/rebased account cache first and removes the guest key second. The order makes every interruption recoverable:

- before the canonical response is committed locally, the untouched guest key remains and the client safely sends it again;
- if a crash leaves both keys, the matching subject's account key wins on reload and the guest key is cleaned up; and
- a retryable failure keeps the guest state intact, while a permanent rejection ends the newly established session and returns the candidate to that untouched guest state.

#### Receipts for local changes

Receipts and bookmark tombstones stay outside the exam-facing `PracticeState`. A server canonical envelope contains every applicable receipt. A locally changed item awaiting acceptance omits only its own receipt:

- changing the active attempt omits `activeAttemptReceivedAt`;
- adding a finished attempt omits that attempt ID from the `finishedAttempts` receipt map;
- changing one latest answer omits only that question ID from the `latestAnswers` receipt map; and
- toggling a bookmark writes `{ isBookmarked }` without `receivedAt`, preserving a removal as a tombstone.

A migrated legacy envelope begins with all receipts absent. The server stamps every missing receipt on first sync. During canonical-response rebase, the client removes receipts only from paths whose newer local mutations it replays. Receipt absence therefore identifies the exact records that still need acceptance without a second dirty-state structure or a browser timestamp.

#### Single-flight send and rebase

Each durable cache holds the current envelope, the last canonical envelope accepted and returned by the server, a monotonically increasing local revision, the acknowledged revision, and a compact path-aware mutation journal. The journal stores replacement/removal values, not queued envelopes, and is persisted alongside the optimistic state before network work begins.

The coordinator permits at most one whole-envelope request in flight. Routine edits use the agreed ~2–5 second debounce; submitting an exam, toggling a bookmark, leaving an attempt, tab-hidden, and explicit `flush()` request immediate work. A send records its envelope and `sentRevision`. Edits made while it is in flight advance the revision and coalesce into the same journal rather than starting another request.

When a response returns, its canonical envelope always becomes the new base. The module replays only journal entries whose revision is newer than `sentRevision`, omits the receipts for those replayed paths, persists the result, and immediately sends again when any replayed mutation remains. With no newer mutation it adopts the canonical envelope directly. This send-and-rebase rule preserves other-device contributions and new server receipts without implementing the domain merge in TypeScript. It applies to an interrupted first sync as well as ordinary writes.

Network errors, `503`, other retryable server failures, and token acquisition failures retain the latest state and journal without rollback. A permanent `400`, `413`, or `415` follows the validation section's rollback rule. There is no permanently-failed queue state.

#### Token and session lifecycle

The persistence module depends on a small Better Auth token adapter; the adapter owns auth details while the coordinator owns queued work. The 15-minute ES256 JWT remains memory-only. Token acquisition is single-flight, so concurrent requests share one refresh promise and queued changes remain durable while it runs. After a `401`, invalidate the token once, acquire a fresh one, and retry the same write once. A network or token-refresh failure is retryable and never erases or rolls back a cache.

If Better Auth confirms that the session has disappeared, stop account synchronization and enter the quarantined reauthentication state described above. Resume only after the same subject authenticates. Explicit sign-out alone runs the flush, exact-key erasure, and session-ending path.

#### The merge, exactly

Settled by walking concrete conflict scenarios through a prototype ([#40](https://github.com/timbarreto/acn-fde/issues/40)); the same rules run on both sides of the wire and every case below was verified idempotent — re-merging never changes the result. One of #40's four rules was subsequently **reversed** by [#50](https://github.com/timbarreto/acn-fde/issues/50) — see the first bullet, which is now the opposite of what #40 concluded.

- **`latestAnswers` is stored and merged per-question, newest-wins.** Each entry is an answer plus a receipt, resolved by the server-stamped clock — structurally identical to the bookmark tombstones below, bounded by the same 102-question bank, needing the same absent garbage collection. This is the **reverse of [#40](https://github.com/timbarreto/acn-fde/issues/40)'s original rule**, which derived the field (then called `progress`) from the retained attempts with `progressFromAttempts`. Two things overturned it:
  - **The reason #40 gave no longer holds.** It traded losslessness for a much smaller practice state envelope. [#43](https://github.com/timbarreto/acn-fde/issues/43) measured a 30-question-per-attempt envelope at **42.7 KiB raw / 1.5 KiB gzipped**; [#53](https://github.com/timbarreto/acn-fde/issues/53) corrected the premise because a focused attempt can contain all 102 questions. Even the saturated real maximum is only about **222 KiB raw / 3.7 KiB gzipped**, and a bounded 102-entry latest-answer map adds little. Size was never the constraint it was priced as.
  - **Deriving is not lossless, and [#50](https://github.com/timbarreto/acn-fde/issues/50) requires that signing in cost the user nothing visible.** Today the field is a stored map that outlives the attempts that produced it (`src/App.tsx:52-59` derives it only as a fallback for legacy blobs with an empty map, while `:152` caps attempts at 30). Deriving it from a 30-attempt window drops any answer held only by an older attempt. Ordinary use is unaffected — 30 attempts hold 300–900 answer slots against 102 questions, and the queue prioritises never-answered — but a user who covered the bank early and then drilled a single domain across 30+ short attempts would watch their answered count collapse from ~102 to ~15 and their readiness score crater, at the exact moment they signed in. That is the cramming power user, who is also the most likely to want cross-device sync.

  The residual cost is one more instance of a pattern the design already builds for bookmarks, plus per-question receipts. `progressFromAttempts` survives only where it already lives: deriving a legacy candidate's latest answers when the blob has none.
- **Attempts union by ID, capped at the 30 newest by bounded retention time.** For each finished attempt, `retentionTime = min(finishedAt, firstReceivedAt)`. The submitted `finishedAt` remains unchanged because it describes candidate activity; the immutable first receipt only prevents a device clock set far into the future from pinning an attempt forever. A genuinely old offline attempt still sorts by its old `finishedAt`, so syncing it later cannot evict newer history. Each incoming envelope and each stored envelope contains at most 30 finished attempts. Two disjoint 30-attempt sets plus an abandoned active-attempt loser may transiently produce 61 during the merge; resolve the active-attempt collision first, then retain 30 before persisting and returning.
- **The active attempt resolves by newest receipt, and the loser is preserved, not destroyed.** When two devices each hold an attempt in progress, the losing attempt is finished as-is into `attempts` with `outcome: "abandoned"`, scored on what was answered. Silently deleting it was the original design and would have destroyed a half-finished attempt with no trace. It requires UI that renders such an attempt differently from one the candidate chose to submit. Resolve the active attempt **before** applying the retention cap, so a rescued attempt can evict an older one.
- **A finished attempt records *how* it ended, not merely that it did.** `outcome` is `"submitted" | "expired" | "abandoned"`, replacing the `abandoned?: boolean` [#40](https://github.com/timbarreto/acn-fde/issues/40) specified ([#51](https://github.com/timbarreto/acn-fde/issues/51)). Naming the concept exposed a third ending nobody had recorded: `src/App.tsx:520` already auto-finishes an attempt when its timer reaches zero (`if (!timerPaused && remaining === 0) onComplete(attempt)`), which today is indistinguishable from the candidate pressing "Submit exam". Running out of time is a pacing signal a GH-600 candidate wants to see in their history, and #40's own argument — that an abandoned attempt must not look like a chosen submission — applies to it verbatim. The enum is also open to further endings; a boolean is not.
- **A stale in-progress copy of an attempt already completed elsewhere is cleared, not resurrected** — and reported as "no work lost", since the finished version is in history.
- **Bookmarks carry per-question tombstones** (`{ isBookmarked, receivedAt }`) and resolve by newest receipt, which handles remove-then-re-add across three devices correctly. The map needs no garbage collection: it is bounded by the question bank (102 questions), not by user activity.
- **Receipts are stamped by the server.** Browser clocks never enter conflict resolution — a device with a fast clock would otherwise win every conflict permanently, with no way for another device to override it. Ordering becomes arrival order, which is a sound proxy for causality in a single-user app.
- **Legacy blobs** migrate in the browser with every receipt absent. A legacy answer map carries no per-question provenance, so the server stamps its entries, attempts, active attempt, and bookmark state at first-sync arrival time — the rule #40 deleted when it derived the field, restored now that `latestAnswers` is merged again ([#50](https://github.com/timbarreto/acn-fde/issues/50), [#56](https://github.com/timbarreto/acn-fde/issues/56)). First-sync time is the oldest defensible receipt, so any later accepted answer from any device wins; `finishedAt` remains candidate activity and enters only the bounded-retention calculation.

### CoreEx API and data model

Scaffold the smallest CoreEx API-only solution as `backend/Acn.Fde.Practice`: PostgreSQL enabled, with reference data, messaging, outbox, subscribers, relay, and a DDD domain project omitted. Verified reachable with `CoreEx.Template@4.0.0-preview-2` ([#41](https://github.com/timbarreto/acn-fde/issues/41)) — the trim flags do what they say and produce five source files:

```
dotnet new coreex     -n Acn.Fde.Practice     -re false -dp Postgres -oe false -mp None
dotnet new coreex-api -n Acn.Fde.Practice.Api -re false -dp Postgres -oe false
```

Run `coreex-api` from the **solution root**, not from `src/` — it creates its own `src/` and `tests/` relative to the working directory, and it does not register itself in the `.slnx`, so both new projects need `dotnet sln add`.

Four things the template scaffolds in that this design must then remove; none are controlled by a flag, so each is a deliberate edit to generated code:

- **Redis.** `builder.AddRedisDistributedCache("redis")` plus a FusionCache backplane, emitted regardless of every trim flag, with a `docker-compose.yml` that provisions Redis as a real dependency. A second always-on service is incompatible with the cost posture. Reduce FusionCache to L1-only and drop `Aspire.StackExchange.Redis.DistributedCaching` and `ZiggyCreatures.FusionCache.Backplane.StackExchangeRedis`. Single-instance routing (`max_instances: 1`) is what makes an in-process cache correct here.
- **`Aspire.Azure.Npgsql`**, which pulls `Azure.Core`, `Microsoft.Extensions.Azure`, and MSAL into the image to support Entra ID authentication against a database that only ever uses a password. Use plain `Aspire.Npgsql`.
- **`app.UseHttpsRedirection()`**, which is wrong inside the container — the Worker terminates TLS and speaks plain HTTP to the container.
- **`app.UseIdempotencyKey()`**, which [#43](https://github.com/timbarreto/acn-fde/issues/43) already deleted from the design: the merge is idempotent, so no receipt or key is needed.

Also set `OTEL_SDK_DISABLED=true` in production. `builder.WithCoreExTelemetry().UseOtlpExporter()` is scaffolded on the assumption of a collector; in the deployed container there is none, and the exporter otherwise retries against `localhost:4317` forever. Aspire supplies the collector locally, so this is a production-only setting. Use a `practice_state` row per Better Auth subject containing the validated state JSON, receipts, and change log. Expose an authenticated `GET` and a single authenticated **merge-on-write** operation, using CoreEx contracts, validators, application service, EF repository/unit of work, ProblemDetails/exception mapping, execution context, OpenAPI, and health checks.

#### Writes never conflict

Because the merge is deterministic and idempotent ([#40](https://github.com/timbarreto/acn-fde/issues/40)), the server merges rather than replaces, and there is no optimistic-concurrency protocol at all ([#43](https://github.com/timbarreto/acn-fde/issues/43)). The client sends its full state; the server, inside one transaction, takes the row `FOR UPDATE`, merges the incoming state into the stored state, stamps receipts with server time, writes, and returns the canonical result.

This deliberately deletes a large amount of the original design: **no `If-Match`, no ETags, no `409`, no `428`, no client-side domain-merge implementation, no shared TypeScript/.NET merge fixtures, no optimistic-concurrency retry loop, no idempotency key, and no `practice_import` table or dedicated import endpoint.** Re-sending the same state is harmless by construction, which is what made the deleted `practice_import` table unnecessary — sending a guest's practice state twice converges on the same result. A guest's first sync is therefore an ordinary write, not a special operation.

Consequences to design for:

- **A merge can only add information.** Anything that removes data needs an explicit tombstone (bookmarks have one) or its own endpoint. A future "delete all my practice data" or account deletion cannot be expressed as a write — see [#44](https://github.com/timbarreto/acn-fde/issues/44).
- **The client always makes canonical state its base.** If edits occurred after the sent revision, it replays only those path mutations without receipts and sends the rebased envelope again. This is transport rebasing, not a second domain merge: the .NET merger remains the only code that resolves two accepted envelopes. Keeping the pre-response local envelope wholesale would discard remote contributions and newly stamped receipts, which is the exact mid-edit bug the revision journal prevents ([#56](https://github.com/timbarreto/acn-fde/issues/56)).
- **Sizing is bounded, not a constraint.** The previous 42.7 KiB measurement assumed 30 questions per attempt, but focused practice can contain the entire 102-question bank. A deliberately saturated valid envelope — 30 such finished attempts, one active attempt, every answer and flag, every bookmark, and all receipts — is about **222 KiB raw / 3.7 KiB gzipped**. The largest transient merge is about **424 KiB raw** before the 61 finished attempts are reduced to 30. The request-body ceiling is 512 KiB; whole-document writes remain cheap.
- **Write cadence is debounced (~2–5 s) with immediate flushes on milestones**: submitting an exam, toggling a bookmark, leaving an attempt, and tab-hidden. That is roughly 3–6 writes per exam rather than one per answer. Note this is a bandwidth and database-write concern, *not* a cost lever: the container stays awake for five minutes past any activity, so the awake time of a 20-minute exam is the same either way. `localStorage` remains the crash-resilience story for the few seconds in between.

### Data ownership, durability, and deletion

Settled in [#44](https://github.com/timbarreto/acn-fde/issues/44). The two stores have opposite risk profiles, and the design leans on that rather than fighting it.

| Store | Holds | Platform recovery | If lost |
|---|---|---|---|
| D1 (Cloudflare) | identity: `user`, `account`, `session`, `jwks` | Time Travel point-in-time recovery, 30 days (confirmed: always on, no configuration, and the account is on Workers Paid) | Severe — Better Auth reissues random user ids, so every practice row would be orphaned. Mitigated by `github_account_id`. |
| PostgreSQL (Neon Free) | all practice data | 6-hour window, one manual snapshot, **no scheduled backups** | Largely self-healing — see below |

**Client caches are the de facto backup.** Because writes are a server-side merge that only ever adds information ([#43](https://github.com/timbarreto/acn-fde/issues/43)), every device keeps a full copy in its per-user cache, and the next sync from any of them restores the server. Practice data therefore has roughly one backup per device the user has used, with no infrastructure at all.

**What that does not cover, stated plainly:** server loss *and* cache loss together is total loss, and server loss affects everyone at once. Users who do not return with an intact cache lose their history. That is the accepted risk on Neon Free, and it belongs in the README rather than being discovered.

Given this, **no backup cron is built.** The `pg_dump` → R2 pipeline sketched in [#38](https://github.com/timbarreto/acn-fde/issues/38) is deliberately not implemented: it would wake the container and the database on a timer, which the CU-hour guardrails specifically warn against, to protect reconstructible study data that clients already replicate. The planned Neon Launch flip — 7-day PITR and scheduled backups, likely under US$1.50/month — remains the upgrade trigger when real user data lands.

**Export** is a client-side JSON download. The browser already holds the full state, so it needs no endpoint, no new data path, and no server work — and it gives any user who cares a real backup.

**Deletion** needs explicit endpoints because a merge cannot express removal:

- *Delete all my practice data* — `DELETE /api/practice-state`, keeping the account. The label must say what it removes: it deletes attempts, bookmarks, and latest answers, not merely the statistics a candidate sees ([#51](https://github.com/timbarreto/acn-fde/issues/51)). This matters more than it looks for a practice-exam tool: question selection is driven by prior answers, so starting fresh is a plausible request.
- *Delete my account* — `DELETE /api/practice-state` **first**, then Better Auth's `POST /api/auth/delete-user`. No transaction spans D1 and PostgreSQL, so the order is the safety mechanism: a mid-way failure leaves an account with no data, which is harmless and retryable, rather than an orphaned row nobody can reach. The client retries.

**What is stored about a person:** a Better Auth user id, GitHub display name, avatar URL, and email (Better Auth's schema requires it `NOT NULL UNIQUE`), plus the GitHub account id. The GitHub **access token is not retained** — it is cleared once sign-in completes, since nothing calls the GitHub API afterwards. State this list in the README.

### Public API, concrete types, and end-to-end call stacks

#### Wire and backend types

`src/lib/practice-api.ts` is a small handwritten wire adapter: camel-case TypeScript interfaces plus one typed `fetch` operation for each of the three practice-state methods. The UI keeps its own handwritten types and maps them at this boundary rather than importing wire types into UI, Worker, or backend code. The CoreEx OpenAPI document describes and verifies the backend contract, but it is not generator input and there is no generated-client drift step. A contract change updates the C# contract, this adapter, and the focused round-trip tests in the same change.

At one envelope and three operations, generation buys too little for its dependency, generated-output policy, and a drift check that must build and run the .NET API. Handwriting accepts review discipline at the wire boundary; the full-stack round-trip tests catch mismatches against the real API instead. Revisit generation only if the API grows enough that maintaining this adapter is no longer plainly smaller than maintaining its generator pipeline.

| Wire/TypeScript shape | C# contract/application type | PostgreSQL persistence type |
|---|---|---|
| `AttemptDto` / `FinishedAttemptDto` (IDs and enums as strings, answer maps, flags, indexes, epoch-millisecond timestamps, plus `finishedAt`, `score`, and `outcome` on finished attempts — see the merge rules) | `Attempt` / `FinishedAttempt` in `Acn.Fde.Practice.Contracts` using `string`, `Dictionary<string, string[]>`, `List<string>`, `int`, `long`, and an `AttemptOutcome` enum | Nested JSON inside `PracticeStateEntity.StateJson : JsonElement` (`jsonb`) |
| `PracticeStateDto { activeAttempt, attempts, bookmarks, latestAnswers }` | `PracticeState` with `Attempt?`, `List<FinishedAttempt>`, `List<string>`, and `Dictionary<string, string[]>` | `PracticeStateEntity.StateJson : JsonElement` (`state jsonb`) |
| `BookmarkReceiptDto { isBookmarked, receivedAt? }` — `receivedAt` is absent only for a local toggle awaiting acceptance | `BookmarkReceipt { bool IsBookmarked; DateTimeOffset? ReceivedAt; }`; canonical responses always populate it | Nested JSON inside `PracticeStateEntity.ReceiptsJson` |
| `PracticeStateReceiptsDto { activeAttemptReceivedAt?, finishedAttempts, bookmarks, latestAnswers }` — receipt-map entries may be absent only for the corresponding locally changed records defined by #56; present values are server-stamped | `PracticeStateReceipts` using nullable `DateTimeOffset` plus `Dictionary<string, DateTimeOffset>` for finished attempts and latest answers, and `Dictionary<string, BookmarkReceipt>` for bookmarks | `PracticeStateEntity.ReceiptsJson : JsonElement` (`receipts jsonb`) |
| `PracticeStateEnvelopeDto { schemaVersion, state, receipts }` — no `etag` ([#43](https://github.com/timbarreto/acn-fde/issues/43)) | `PracticeStateEnvelope` with `int SchemaVersion`, `PracticeState State`, and `PracticeStateReceipts Receipts` | Application `StoredPracticeState { string UserId; PracticeStateEnvelope Envelope; ChangeLog? ChangeLog; }` mapped to one `PracticeStateEntity` |

Concrete persistence models under `Acn.Fde.Practice.Infrastructure.Persistence` are:

- `PracticeStateEntity : IChangeLog`: `string UserId`, `JsonElement StateJson`, `JsonElement ReceiptsJson`, and CoreEx `ChangeLog` fields (`CreatedBy/On`, `UpdatedBy/On`). No ETag/row-version member: writes serialise on `SELECT … FOR UPDATE`, not on optimistic concurrency.
- `PracticeDbContext : DbContext, IEfDbContext`: maps JSON with `JsonElementStringEfConverter`.
- `PracticeEfDb : EfDb<PracticeDbContext>`: exposes `EfDbModel<PracticeStateEntity> PracticeStates`.
- `PracticeStateMapper`: the only serializer boundary, using the shared `JsonSerializerOptions` to convert contract objects to/from `JsonElement`; malformed persisted JSON is treated as a server/data-integrity error, never silently reset.
- `PracticeStateMerger`: the single implementation of the merge rules, in .NET only.

The checked-in migration creates this physical schema:

```sql
CREATE SCHEMA IF NOT EXISTS practice;
CREATE TABLE practice.practice_state (
  user_id varchar(128) PRIMARY KEY,
  github_account_id varchar(64) NOT NULL,
  state jsonb NOT NULL,
  receipts jsonb NOT NULL,
  created_by varchar(250) NOT NULL,
  created_on timestamptz NOT NULL,
  updated_by varchar(250) NOT NULL,
  updated_on timestamptz NOT NULL
);
CREATE INDEX practice_state_github_account_id_idx
  ON practice.practice_state (github_account_id);
```

`github_account_id` is never used for authorization — ownership always derives from `sub`. It exists solely so that a catastrophic D1 loss is a scripted remap rather than a permanent orphaning of every row ([#44](https://github.com/timbarreto/acn-fde/issues/44)).

One table. The `practice_import` table is gone: it existed to stop a retried first sync merging twice, and an idempotent merge makes that impossible by construction ([#43](https://github.com/timbarreto/acn-fde/issues/43)).

#### Public endpoint inventory

These are the application routes the design *uses*. They are not the only ones Better Auth serves: roughly 30 paths are registered by default, and disabling email/password leaves `/sign-in/email` and `/sign-up/email` answering 400 rather than 404 ([#37](https://github.com/timbarreto/acn-fde/issues/37)). Narrow the surface with Better Auth's `disabledPaths` *and* a Worker allowlist that 404s everything else.

| Method and route | Request type | Success type | Auth/storage |
|---|---|---|---|
| `POST /api/auth/sign-in/social` | Better Auth `{ provider: "github", callbackURL }` | **200 JSON `{ url, redirect }`** — not an HTTP redirect; the client navigates to `url`. Also sets a 5-minute `state` cookie | Anonymous; Better Auth/D1 |
| `GET,POST /api/auth/callback/github` | OAuth query (`code`, `state`), PKCE `S256` | Session cookie + frontend redirect | Anonymous callback; GitHub then Better Auth/D1. Route is `/callback/:id` and matches **any** provider id |
| `GET /api/auth/get-session` | HTTP-only session cookie | Better Auth `{ user, session }`; **200 with body `null`** when anonymous, not 401 | Better Auth/D1. **GET only** — POST returns 405 |
| `POST /api/auth/sign-out` | Session cookie + Better Auth CSRF/origin checks | `{ "success": true }` + cleared cookies | Better Auth/D1 |
| `GET /api/auth/token` | Session cookie | `{ token: string }` short-lived JWT | Better Auth D1 session + JWT signing key |
| `GET /api/auth/jwks` | None | Standard `JsonWebKeySet` | Better Auth D1 signing keys; consumed by ASP.NET |
| `POST /api/auth/delete-user` | Session cookie | Account deleted in D1 | Better Auth/D1; must be allowlisted |
| `GET /api/practice-state` | Bearer JWT | `PracticeStateEnvelopeDto` | CoreEx/PostgreSQL |
| `POST /api/practice-state` | Bearer JWT, `PracticeStateEnvelopeDto` | Canonical merged `PracticeStateEnvelopeDto` | CoreEx/PostgreSQL transaction |
| `DELETE /api/practice-state` | Bearer JWT | `204` — row removed | CoreEx/PostgreSQL. Serves both "delete all my practice data" and the first step of account deletion |
| `GET /health/live`, `/health/startup`, `/health/ready` | None | ASP.NET health status | Container/process; readiness checks PostgreSQL |

Three practice operations share one route: `GET`, `POST`, and `DELETE`. `GET` returns an empty schema-v2 envelope when no row exists. `POST` merges and is safe to repeat, so the same call serves a guest's first sync after signing in, ordinary syncing, and any retry — there is no separate endpoint and no precondition header. It is `POST` rather than `PUT` because the semantics are merge-and-return-canonical, not replace. `DELETE` removes the row and returns `204`. Errors use the stable CoreEx Problem Details contract below plus `401` for authentication and `503` for readiness/dependency failure. **409 and 428 no longer occur** ([#43](https://github.com/timbarreto/acn-fde/issues/43)).

#### Request validation and permanent rejection

`POST /api/practice-state` accepts only a bounded, internally coherent practice state envelope ([#53](https://github.com/timbarreto/acn-fde/issues/53)). Validation is atomic: nothing is trimmed, repaired, or merged when any rule fails.

**Before JSON parsing:** accept only uncompressed UTF-8 `application/json`. The Worker and CoreEx host both enforce an actual-body limit of **512 KiB**, including when `Content-Length` is absent or false; request compression is unsupported, while response compression remains allowed. Reject unsupported media or content encoding before forwarding/parsing, and cap JSON nesting at 16.

**Version compatibility:** the current wire version is schema v2. The browser migrates the legacy `agentic-ready-gh600-v1` local shape to v2 before sending it. A future backend keeps explicit input migrators for every wire version that has shipped, so an old offline browser remains readable after a server upgrade; missing, malformed, and never-issued versions are rejected rather than guessed at.

**Closed-world identifiers:** `contracts/question-recognition-manifest.json` is an append-only recognition manifest derived initially from `src/data/questions.json`. It records every historically issued question ID, its selection mode, and the option IDs valid for that question; removing a question from the live bank never removes its recognition entry. The backend must recognise new IDs before frontend assets can emit them. Unknown question IDs, unknown option IDs, and invalid question/option pairings are rejected. This bounds the merge-only JSON maps and keeps old offline clients valid without coupling validation to question wording.

**Cardinality and string bounds:**

| Value | Accepted bound |
|---|---:|
| Finished attempts in an incoming or stored envelope | 30 |
| Active attempts | 1 |
| Question IDs, answer-map entries, or flags in one attempt | 128 each |
| Latest-answer entries | 128 |
| Visible bookmarks or bookmark receipt/tombstone entries | 128 each |
| Finished-attempt receipt entries | 30 |
| Domains in one attempt | 6 |
| Options in one answer | The recognised options for that question; currently at most 5, and at most 1 for a single-select question |
| Attempt ID | Canonical UUID, exactly 36 characters |
| Question ID before recognition lookup | 64 characters |
| Option ID before recognition lookup | 32 characters |
| Attempt label | 128 characters, with control characters rejected |

The 128-question ceiling leaves explicit headroom over today's 102-question bank; crossing it is a schema change. Reject unknown or duplicate JSON properties before typed validation. Lists, maps, and answer arrays contain no duplicates. Question IDs in an answer map or flag list belong to that attempt's question list; `currentIndex` addresses an existing question; mode, domains, outcome, and score use their closed enums/ranges. Finished-attempt IDs are unique and do not duplicate the active attempt. A finished attempt has `finishedAt`, `score`, and `outcome`; an active attempt does not.

**Scalars and time:** `durationMinutes` is an integer from 1 through 1,440 and `score` is an integer from 0 through 100. `startedAt`, `finishedAt`, and optional `pausedAt` are non-negative integer epoch milliseconds in JavaScript's valid date range; `finishedAt >= startedAt`, and an active attempt's `pausedAt >= startedAt`. `pausedDurationMs` is a non-negative safe integer. Receipts use canonical UTC RFC 3339 with millisecond precision and may not be more than five minutes ahead of server time. Every receipt that is present obeys these rules. Future activity times are preserved rather than clamped because bounded retention time prevents them from pinning history.

**Receipt completeness:** an incoming envelope may omit `activeAttemptReceivedAt` for a locally changed active attempt, a finished-attempt receipt for a newly finished attempt, a latest-answer receipt for a locally changed question, and a bookmark `receivedAt` for a local toggle/tombstone ([#56](https://github.com/timbarreto/acn-fde/issues/56)). A migrated guest envelope may initially omit all receipts. The server stamps every missing applicable receipt while merging and returns a complete canonical envelope. A receipt or tombstone referring to no corresponding recognised record/question is invalid; a stored or returned canonical envelope with a missing applicable receipt is a server integrity error.

**Error contract:** permanent request failures use bounded Problem Details responses with a stable `code`: `400 malformed_json`, `400 unsupported_schema_version`, `400 invalid_practice_state`, `413 practice_state_too_large`, or `415 unsupported_media_type`. Validation details contain at most 20 field paths and reason codes, plus a trace ID; they never echo a submitted value or the full envelope.

**Client rollback:** the client treats every permanent code above alike. It immediately restores the most recent canonical practice state the server accepted and returned, discarding later unacknowledged local edits, then resumes normal syncing. If a guest's first sync after sign-in is rejected, that canonical account state does not yet exist: end the newly established Better Auth session, abort the account-mode transition, and return the candidate to the untouched guest practice state. Show one dismissible accessible notification — “Sync was rejected. Your last synced practice state has been restored.” or, for first sync, “Sign-in could not restore your practice state. You are continuing as a guest.” There is no permanently-failed sync state or recovery workflow. Network failures, `503`, and server failures remain retryable and never trigger rollback.

#### Authentication call stacks

- **GitHub sign-in:** React `authClient.signIn.social()` -> Vite proxy (local only) -> `worker/index.ts: fetch(Request, Env)` -> `run_worker_first` match on `/api/*` -> route allowlist -> `createAuth(env).handler(request)` (built per request or memoised per isolate — `env` is not available at module scope in workerd) -> Better Auth returns **200 JSON `{ url }`** and the client navigates to GitHub -> GitHub redirects to `/api/auth/callback/github` -> Better Auth writes its typed `user`, `account`, `session`, and `verification` records through `Env.AUTH_DB : D1Database` (non-atomically — D1 has no interactive transactions) -> callback sets secure session cookie -> React calls `authClient.getSession()`.
- **API token:** persistence token adapter -> `authClient.token()` -> Better Auth handler -> session-cookie lookup in D1 -> JWT plugin reads the D1 `jwks` row and signs **ES256** claims (`sub` Better Auth user ID, plus the explicitly pinned `iss`/`aud` and a 15-minute default `exp`; `definePayload` keeps the rest of the user object out) -> `{ token }` remains in the adapter's in-memory store. Concurrent callers share one acquisition; a `401` invalidates it once and retries the request once.
- **JWT validation:** `Authorization: Bearer` reaches the container -> ASP.NET `JwtBearerHandler` resolves keys through `ConfigurationManager<JsonWebKeySet>` against `/api/auth/jwks` (**not** `Authority`/`MetadataAddress` — Better Auth publishes no OIDC discovery document), verifies signature/issuer/audience/expiry -> `ClaimsPrincipal` -> an execution-context mapper creates CoreEx `AuthenticationUser { Id = sub, UserName = name, Type = AccountUser }` -> `UseExecutionContext()` makes that identity available to every service/repository call. A client-supplied user ID is never present in any practice request contract.

#### `GET /api/practice-state` call stack

```text
PersistenceStore.resolveAccount(subject)
  -> PracticeApi.getPracticeState(): Promise<PracticeStateEnvelopeDto>
  -> fetch GET /api/practice-state + Bearer token
  -> Worker fetch() -> getContainer(env.COREEX, "api").fetch(request)
  -> JwtBearerHandler -> ClaimsPrincipal -> CoreEx ExecutionContext
  -> PracticeStateController.GetAsync()
  -> WebApi.GetWithResultAsync<PracticeStateEnvelope>()
  -> IPracticeStateService.GetAsync(CancellationToken)
  -> PracticeStateService.GetAsync() reads ExecutionContext.Current.User.Id
  -> IPracticeStateRepository.GetAsync(string userId, CancellationToken)
  -> PracticeStateRepository.GetAsync()
  -> PracticeEfDb.PracticeStates.GetAsync(userId)
  -> PracticeDbContext -> NpgsqlDataSource("Postgres")
  -> SELECT state, receipts, audit columns
       FROM practice.practice_state WHERE user_id = @sub
  -> PracticeStateEntity -> PracticeStateMapper -> StoredPracticeState
  -> Result<PracticeStateEnvelope> -> WebApi
  -> JSON body -> Worker pass-through -> handwritten wire adapter
  -> mapper to UI PracticeState + per-user local envelope
```

The service creates only an in-memory empty envelope when no row exists; it does not write during GET.

#### `POST /api/practice-state` call stack

One path serves ordinary syncing, a guest's first sync after signing in, and every retry.

```text
React functional update -> persistence module writes PracticeState + receipts/tombstones
  -> persist optimistic envelope + path mutation at a new local revision
  -> debounce ~2-5s, or immediate flush on submit/bookmark/exit/tab-hidden
  -> capture sentRevision; PracticeApi.postPracticeState(envelope)
  -> Worker -> Container -> JWT/ExecutionContext
  -> PracticeStateController.PostAsync()
  -> WebApi.PostWithResultAsync<PracticeStateEnvelope, PracticeStateEnvelope>()
  -> PracticeStateEnvelopeValidator.ValidateWithResultAsync()
     (schema v2; closed-world IDs; semantic, cardinality, and timestamp bounds)
  -> IPracticeStateService.MergeAsync(PracticeStateEnvelope, ct)
  -> IUnitOfWork.TransactionAsync(...)
  -> IPracticeStateRepository.GetForUpdateAsync(userId from ExecutionContext)
     -> SELECT state, receipts, audit columns
        FROM practice.practice_state WHERE user_id=@sub FOR UPDATE
  -> PracticeStateMapper -> stored envelope (or empty when no row)
  -> IPracticeStateMerger.Merge(stored, incoming, serverNow)
     -> merge latestAnswers per question by receipt;
        union attempts; order by min(finishedAt, firstReceivedAt);
        resolve active attempt (rescuing the loser) BEFORE the cap;
        reduce at most 61 finished attempts to 30;
        bookmark tombstones; stamp new receipts with server time
  -> repository INSERTs a new row or UPDATEs the existing one through PracticeEfDb
       UPDATE practice.practice_state
       SET state=@jsonb, receipts=@jsonb,
           updated_by=@sub, updated_on=@now
       WHERE user_id=@sub
  -> PostgresUnitOfWork COMMIT
  -> canonical PracticeStateEnvelope -> browser
  -> make canonical envelope the local base
  -> replay only path mutations newer than sentRevision, without their receipts
  -> persist, then immediately POST again if replayed mutations remain
```

A lost response costs nothing: the client simply sends again, and merging the same state twice is a no-op. Concurrent writers serialise on `FOR UPDATE` rather than racing an ETag, so there is no conflict to report and no retry loop to bound.

`IPracticeStateRepository` therefore exposes typed `GetAsync`, `GetForUpdateAsync`, `UpdateAsync`, and `CreateAsync`; no controller or service receives `PracticeStateEntity`, `DbContext`, `NpgsqlConnection`, SQL, or D1 types.

#### Health/readiness call stack

`/health/live` checks only the ASP.NET process; `/health/startup` confirms configuration/JWKS settings are structurally valid without requiring a live GitHub call; `/health/ready` -> ASP.NET health middleware -> Aspire Npgsql health check -> `NpgsqlDataSource` -> `SELECT 1`. Detailed health output remains authorization-protected and is not used by Cloudflare's anonymous probe.

`/health/ready` is the only endpoint that touches PostgreSQL, and **nothing may poll it on a schedule** — a periodic `SELECT 1` keeps the Neon compute permanently awake and exhausts the Free plan's CU-hour budget mid-month ([#38](https://github.com/timbarreto/acn-fde/issues/38)). Anonymous and automated probes use `/health/live`.

### Complete local setup and Aspire integration

Add `Acn.Fde.Practice.AppHost` as the one-command local orchestrator. CoreEx's [`samples/aspire/Contoso.Aspire`](https://github.com/Avanade/CoreEx/tree/main/samples/aspire/Contoso.Aspire) is a useful reference for exactly one thing — CoreEx API projects as Aspire project resources with health-gated `WaitFor` and `/health/ready/detailed` surfaced via `ResourceUrlAnnotation`. It contains no container, PostgreSQL, executable, migration, secrets, Dockerfile, or test resource, so it is **not** precedent for the rest of this graph; cite Aspire's own documentation for that ([#39](https://github.com/timbarreto/acn-fde/issues/39)).

The product is **Aspire** (no longer ".NET Aspire"), currently 13.4.x, documented at aspire.dev. Packages: `Aspire.AppHost.Sdk`, `Aspire.Hosting.AppHost`, `Aspire.Hosting.PostgreSQL`, `Aspire.Hosting.JavaScript`, `Aspire.Hosting.Testing`. Note `Aspire.Hosting.NodeJs`/`AddNpmApp` is **renamed and dead** at 9.5.2 — use `Aspire.Hosting.JavaScript`/`AddViteApp`.

Local development uses no Cloudflare or Neon resources and has this explicit dependency graph:

```text
Aspire PostgreSQL container -> PostgreSQL migration resource -> CoreEx API
local Wrangler D1 migration resource ------------------------> Vite + Worker (one process)
CoreEx API --------------------------------------------------> Vite + Worker (one process)
```

Four resources, not six: the Worker no longer has its own process, port, health check, or proxy ([#45](https://github.com/timbarreto/acn-fde/issues/45)).

- **Prerequisites:** .NET 10 SDK (a deliberate pin — Aspire 13 supports .NET 8/9/10), the Aspire CLI (`npm install -g @microsoft/aspire-cli`, or commit to `dotnet run --project` and say so), Docker, Node/npm, and the repo-pinned Wrangler package. Run `npm ci` and `dotnet restore backend/Acn.Fde.Practice.slnx` once after checkout; AppHost starts services but never installs dependencies.
- **`npm run dev` must keep working standalone.** Most frontend work touches `src/` and needs neither PostgreSQL nor D1. The plain Vite dev server against the guest/offline path stays a first-class inner loop, so a UI change never requires the .NET toolchain or Docker. `dev:full` is for full-stack work only.
- **PostgreSQL:** AppHost provisions PostgreSQL with an Aspire-managed development volume and an `acn_fde_practice` database. `WithReference` injects the `Postgres` connection string expected by CoreEx's existing `AddNpgsqlDataSource("Postgres")` wiring. A one-shot CoreEx Database-tool resource applies checked-in migrations; the API uses `WaitForCompletion` and starts only after PostgreSQL is healthy and migration succeeds.
- **There is no `wrangler dev` resource.** `@cloudflare/vite-plugin` runs the Worker in workerd *inside* the Vite dev server, so Vite and the Worker are one process on one port. Verified end to end against plugin 1.47.0 / Vite 8.1.5 ([#45](https://github.com/timbarreto/acn-fde/issues/45)): the **D1 binding is present and functional** in `env`, `assets.run_worker_first: ["/api/*"]` **beats the SPA fallback on a navigation request** — the [#37](https://github.com/timbarreto/acn-fde/issues/37) blocker — assets are served with HMR intact, and unmatched `/api` paths reach the Worker rather than `index.html`. This deletes the wrangler executable resource, its health check, its fixed port 8787, the Vite `/api` proxy configuration, and `wrangler.local.jsonc`'s reason for existing as a *separate dev server*. The AppHost graph drops from six resources to four.
- **Better Auth/D1 migrations:** a one-shot executable still runs `wrangler d1 migrations apply ... --local` before the dev server starts, gated with `WaitForCompletion`. No public migration endpoint is introduced. Both hazards the spec named are now measured and **neither survives**:
  - It does **not** hang. Run with piped stdin and stdout — Aspire's exact process shape — wrangler prints `Using fallback value in non-interactive context: yes` and proceeds, exiting 0. Note the fallback is per-prompt and not always "yes": `wrangler d1 create`'s "add this binding to your config?" falls back to *no*.
  - `--persist-to` needs no coordination. The CLI and the plugin both default to `.wrangler/state`, and the plugin read the exact row the CLI had inserted. Only override the path if you override it in *both* places.
- **`package.json` must keep `"type": "module"`.** The plugin is ESM-only; without it Vite loads the config with `require` and fails to resolve the plugin at startup. This repo already satisfies it — do not regress it.
- **API routing:** production `wrangler.jsonc` uses the Cloudflare Container binding. A separate `wrangler.local.jsonc` omits Containers and sends `/api/*` to the AppHost-provided `COREEX_API_ORIGIN`, selected through the plugin's config option rather than by running a second dev server; both configurations execute the same Worker routing and Better Auth code. The API can start before the Worker because JWKS retrieval is lazy, and validates tokens against the local Worker's JWKS URL once requests begin.
- **Frontend and Worker together:** AppHost runs Vite via `AddViteApp` with HMR, on a **fixed host port 5173** — Aspire proxies its `port` to an allocated `targetPort` by default, so the host port is what must be stable, because the development GitHub OAuth callback is `http://localhost:5173/api/auth/callback/github`. With the plugin, that one port *is* the same-origin topology: no proxy rules to write and no second origin to get wrong. Better Auth's development `baseURL` is `http://localhost:5173` with `trustedOrigins` including it — and the 8787 confusion the spec previously warned about cannot occur, because 8787 no longer exists.
- **Launch Vite as the node process, not through npm** ([#45](https://github.com/timbarreto/acn-fde/issues/45)). workerd *is* reaped cleanly — `SIGINT` to the node process kills workerd, frees the port, and leaves no orphan, so the spec's third local-dev hazard does not bite. But the signal has to arrive: `SIGINT` sent to `npm exec vite`, or to the `sh -c "vite"` it spawns, left the entire tree and its workerd running. A terminal Ctrl-C signals the whole process group and is therefore fine; a supervisor signalling a single PID is not. Point the resource at `node_modules/.bin/vite` so the chain has no wrapper to swallow the signal.
- **Secrets:** store the local GitHub OAuth client ID/secret and Better Auth secret in AppHost .NET user-secrets, surfaced as `AddParameter(..., secret: true)` and attached with `WithEnvironment`. **Setting a process environment variable on the dev server does not put that value in the Worker's `env` object** — a Cloudflare rule that will otherwise be discovered as an `undefined` secret at runtime. Bridge it by setting `CLOUDFLARE_INCLUDE_PROCESS_ENV=true` on the dev-server resource while guaranteeing no `.dev.vars` exists (gitignored, and `dev:full` asserts its absence), which preserves the "secrets never touch disk" property. **This behaviour is unchanged under `@cloudflare/vite-plugin`** and was re-verified against it ([#45](https://github.com/timbarreto/acn-fde/issues/45)): without the flag the Worker's `env` contains only the declared bindings and a process variable is simply absent; with it, the variable arrives. But the bridge is **all-or-nothing** — it injects the *entire* process environment, roughly fifty unrelated keys including `PATH` and `HOME`, alongside the bindings. Nothing may enumerate, log, or serialise `env` wholesale, and code must read named keys only. The same boundary applies to `COREEX_API_ORIGIN`; since Aspire allocates the API port at runtime, either give the API a fixed host port and hardcode the origin in `wrangler.local.jsonc`, or route it through the same mechanism. PostgreSQL uses Aspire-generated local credentials. Cloudflare, production Better Auth, and Neon secrets are not required locally and never enter committed files.
- **Health gating:** Aspire waits only for `Running` — meaning *the process was spawned* — unless a check is explicitly attached. The AppHost therefore attaches `WithHttpHealthCheck` to the Worker and Vite resources and names the probe paths: Vite's `/` serving `index.html`, and for the Worker an unauthenticated endpoint that returns 200 (it cannot be a practice API path, since those correctly return 401 and would never go healthy). Do not build gating on `WithHttpProbe`, which is still `[Experimental]`.
- **Dashboard/observability:** expose frontend, Worker, API/OpenAPI, and anonymous API readiness links in the Aspire dashboard. CoreEx API logs, traces, metrics, health, PostgreSQL dependency spans, and migration status flow to Aspire. Wrangler/Vite get dashboard presence and console logs like any resource, but structured logs, traces, and metrics are OTLP-fed and neither workerd nor the Vite dev server emits them — no Worker OTLP parity is claimed.
- **AppHost configurations** (not "profiles" — Aspire has no such platform feature; these are conditional AppHost code selected by a launch profile or a `--` argument): the default `dev` configuration keeps PostgreSQL/D1 state for iterative work; an `integration` configuration uses isolated temporary storage and a test-only auth entry point, and takes its random non-OAuth ports from `aspire run --isolated` rather than hand-rolled randomisation; a `container` configuration replaces the API project resource with `AddDockerfile` plus `WithContainerRuntimeArgs("--memory", "1g")` to verify Linux/container behaviour against the production image while still using local PostgreSQL and D1. Note that swapping `AddProject` for `AddDockerfile` changes the static type (converge on `IResourceBuilder<IResourceWithEndpoints>` or branch), and a container resource loses the project resource's automatic OTLP and service-discovery wiring, so `WithOtlpExporter()` and `WithReference()` must be called explicitly.
- **One-command flow:** `npm run dev:full` launches AppHost; AppHost runs both migration gates, starts API -> Worker -> Vite, and prints the Aspire dashboard/front-end URLs. Ctrl-C stops the graph without deleting development data. Document explicit `db:reset:local` commands that remove only the named local Aspire/D1 stores after confirmation.

For automated full-stack tests, create `Acn.Fde.Practice.IntegrationTests` with `Aspire.Hosting.Testing` — a normal test project that *references* the AppHost as its entry point, not a second AppHost (the spec's earlier `Test.AppHost` name misdescribed it). It launches the isolated `integration` configuration and calls the application through the Vite/Worker same-origin URL; `GetEndpoint`/`CreateHttpClient` are keyed on resource name, so non-.NET resources are addressable exactly like project resources. It waits on the health state of the resources that **have** a registered check — `WaitForResourceHealthyAsync` on a resource without one resolves as soon as the process starts, which is a false green. A separate Worker test entry uses Better Auth's `testUtils` server-side helpers to create sessions; it is referenced only by `wrangler.test.jsonc`, binds to localhost, exposes no production route, and is excluded from the production bundle/config. `testUtils` was verified to mint a session and a real ES256 JWT on D1 in workerd with **no GitHub contact whatsoever**, but it **registers no HTTP routes** — the test-only entry must expose the session-minting endpoint itself. Note its `createUser` produces no `account` row, so these fixtures never exercise the GitHub link path.

### Production deployment and recovery

Production deployment is a committed script run deliberately from an operator's terminal, not an automatic or GitHub Actions deployment ([#54](https://github.com/timbarreto/acn-fde/issues/54)). It accepts only a clean checkout whose `HEAD` exactly matches `origin/main`, records that commit as the release identifier, and permits only one production deployment at a time. The script captures the active Worker version during preflight and checks it again immediately before deployment; a change aborts the run. The two migration tools use their database-native ledgers and locking rather than a new distributed deployment lock.

**Bootstrap runtime secrets once, outside the release sequence.** While the existing static Worker is still active, a separate helper sets `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `BETTER_AUTH_SECRET`, and the pooled `POSTGRES_CONNECTION_STRING` as Worker secrets. The deployment script verifies that those names exist but never rewrites their values. Secret rotation is a separate maintenance operation because `wrangler secret put` creates a Worker deployment. PostgreSQL migrations cannot reuse the runtime secret: they require the direct Neon endpoint, and Worker secrets are not readable back into the operator's terminal. Retrieve that direct connection string from the password manager at deployment time and pass it only through the migration child process's environment — never through `argv`, logs, a file, or the Worker.

The non-mutating preflight runs before any database change:

1. verify the clean/current `main` checkout, pinned tools, Docker availability, and the expected Cloudflare account, Worker, and D1 identifiers;
2. verify the required Worker-secret names, the direct PostgreSQL connection, and both current migration ledgers;
3. capture the active Worker version and its Container image digest; and
4. run `wrangler deploy --dry-run` when the installed Wrangler/Container path supports it.

The deployment script does not rerun the test suites; validation of `main` belongs to the build/CI path. Its responsibility is to prove the production target is safe to mutate.

**Every database change follows expand/contract compatibility.** A migration applied before a release must be safe for both the currently active application and the incoming one. A rename, removal, tightened constraint, or irreversible rewrite waits for a later cleanup release whose active and rollback-target code already tolerate the contraction. This is load-bearing because a Worker update and a Container image update are not atomic. The measured singleton rollout ([#42](https://github.com/timbarreto/acn-fde/issues/42)) served the old Container until roughly 27 seconds after `wrangler deploy` returned, then made one delayed request while the new image started. Adjacent Worker, Container, browser, and database versions therefore remain mutually compatible during deployment and rollback.

The mutating sequence is fixed:

1. derive the expected latest PostgreSQL and D1 migration identifiers from the checked-in release;
2. apply the PostgreSQL migrations through the direct endpoint, then query its ledger;
3. apply the remote D1 migrations, then query its ledger;
4. refuse to continue unless every expected migration is recorded, none is pending, and neither database contains a migration unknown to this checkout;
5. re-check that the active Worker version still equals the preflight version; and
6. run `wrangler deploy --containers-rollout=immediate`, attaching the Git commit SHA to the Worker version.

PostgreSQL goes first because it is the external dependency with the more failure-prone connection and migration path; D1 stays immediately adjacent to the Worker deployment it supports. With additive-first migrations, either database may safely remain ahead of the live code if a later step fails. The singleton uses an immediate Container rollout because a percentage rollout cannot provide a canary when `max_instances` is one; a request may pause during restart, and account sync already treats that failure as retryable.

**Recovery is forward-only for databases and conditional for the application:**

- If a migration fails, stop. Leave any successfully applied migration in place, repair the cause, and rerun the idempotent sequence from the first unapplied step.
- If `wrangler deploy` exits unsuccessfully, compare the active Worker version and Container image with the captured values. If either changed, explicitly roll back to the captured Worker version and its retained image, then verify the prior application is active. Never roll back D1 or PostgreSQL automatically.
- Do not delete an image while it is the current rollback target. Cloudflare Worker rollback does not reverse storage changes, which is why the compatibility rule applies to the captured application version too.

A completed `wrangler deploy` has a deliberately narrow production gate. Retry every five seconds for at most one minute: first require the SPA and `/health/live`, then wake the Container and require `/health/startup` and `/health/ready`. These are deployment-only checks, never a scheduled monitor. The gate does **not** exercise GitHub sign-in, authenticated practice APIs, or a guest's first sync. If any required check still fails at the deadline, leave the new deployment active, print the failed checks and release identifiers, and exit nonzero; a health failure is reported and repaired forward, never rolled back automatically.

Print a secret-free deployment summary containing the commit SHA, previous and new Worker versions, previous and new Container image digests, expected and observed migration heads, timestamps, and both health-gate results. The Worker deployment metadata and terminal output are the deployment record; do not add a deployment database, issue, or committed log.

## Files to modify

- Frontend/runtime: `package.json`, `package-lock.json`, `vite.config.ts`, `wrangler.jsonc`, `.gitignore`
- Frontend state/auth: `src/App.tsx`, `src/types.ts`, `src/lib/navigation.ts` (a fifth `Account` view and route), new framework-independent `src/lib/persistence.ts`, thin `src/lib/use-practice-state.ts`, `src/lib/auth-client.ts`, handwritten `src/lib/practice-api.ts`, and focused Vitest files. Types are renamed per [#51](https://github.com/timbarreto/acn-fde/issues/51) (`PersistedState` -> `PracticeState`, `ActiveAttempt` -> `Attempt`, `CompletedAttempt` -> `FinishedAttempt`, `progress` -> `latestAnswers`, `completedAt` -> `finishedAt`, `abandoned` -> `outcome`); per-question receipts live in the receipts structure, **not** inside the exam-facing model; the persistence module owns the durable revision journal and last canonical rollback point; `ExamRunner`'s separate header stays free of sync chrome ([#50](https://github.com/timbarreto/acn-fde/issues/50), [#56](https://github.com/timbarreto/acn-fde/issues/56))
- Wire contract verification: the backend publishes OpenAPI for documentation and focused contract assertions; frontend integration tests exercise the handwritten adapter against the real API (no generated-client drift step and no shared merge fixtures — the merge exists only in .NET)
- Validation contract: new append-only `contracts/question-recognition-manifest.json`, initially derived from `src/data/questions.json`, plus tests that fail when the live bank contains an unrecognised question/option ID or an existing recognition entry is removed
- Cloudflare Worker: new `worker/index.ts`, `worker/auth.ts`, test-only auth entry, Worker tests, generated binding types, committed `migrations/*.sql`, plus `wrangler.local.jsonc` and `wrangler.test.jsonc`
- CoreEx contracts/API: new `backend/src/Acn.Fde.Practice.Contracts/PracticeState*.cs`, `backend/src/Acn.Fde.Practice.Api/Controllers/PracticeStateController.cs`, JWT/execution-context host wiring, OpenAPI, and health configuration
- CoreEx application/infrastructure: new `PracticeStateService`, validators, `IPracticeStateRepository`, `IPracticeStateMerger`, `StoredPracticeState`, `PracticeStateRepository`, `PracticeStateMapper`, `PracticeStateEntity`, `PracticeDbContext`, and `PracticeEfDb` under the generated Application/Infrastructure projects
- CoreEx solution/storage: new `backend/Acn.Fde.Practice.slnx`, Database migration/tool and Test projects, plus `backend/Dockerfile`
- Aspire: new `backend/src/Acn.Fde.Practice.AppHost/` and `backend/tests/Acn.Fde.Practice.Test.AppHost/` projects defining dev, integration, and container resource graphs
- Local/CI/deployment: npm/Aspire orchestration scripts, ignored local D1 storage, a normal non-Playwright CI workflow, secret/environment examples, a one-time Worker-secret bootstrap helper, and the production deployment script above
- Guidance: `README.md`, `AGENTS.md`, and `CLAUDE.md` to replace the obsolete client-only architecture and commands

## Reuse

- Preserve the shape of `PersistedState`, `ActiveAttempt`, and `CompletedAttempt` in `src/types.ts` while renaming them to `PracticeState`, `Attempt`, and `FinishedAttempt` ([#51](https://github.com/timbarreto/acn-fde/issues/51)); reuse `progressFromAttempts` in `src/lib/exam.ts` when deriving a legacy candidate's latest answers.
- Evolve the existing static-assets deployment in `wrangler.jsonc` rather than creating a second public origin.
- Scaffold the solution and API host with CoreEx's `coreex` + `coreex-api` templates, then author the application-specific practice-state contracts and endpoints using CoreEx's [`coreex-contract`](https://github.com/Avanade/CoreEx/blob/main/.github/skills/coreex-contract/SKILL.md) and [`coreex-api`](https://github.com/Avanade/CoreEx/blob/main/.github/skills/coreex-api/SKILL.md) conventions. The templates create the shape; they do not infer these properties and routes. `[Contract] partial` lets CoreEx generate mechanical contract members, while the PostgreSQL, execution-context, validation, repository, health, OpenAPI, and test patterns come from the upstream [Avanade/CoreEx](https://github.com/Avanade/CoreEx) repository, specifically the [`CoreEx.Template`](https://github.com/Avanade/CoreEx/tree/main/src/CoreEx.Template) project, the [application scaffolding guide](https://github.com/Avanade/CoreEx/blob/main/docs/application-scaffolding-guide.md), and the [consumer instructions](https://github.com/Avanade/CoreEx/tree/main/consumer-instructions). This repository has no local CoreEx checkout; treat these as external references only, and pin/record the CoreEx release actually used once implementation starts rather than copying unreleased `main` assets.
- Reuse Better Auth's supported D1 database path and JWT/JWKS plugin rather than inventing sessions or sharing the D1 schema with .NET.
- Handwrite the three-operation frontend wire adapter. Keep it deliberately thin, map to UI types at its boundary, and verify it against the running CoreEx API in focused integration tests. OpenAPI remains documentation and a backend contract artifact, not a TypeScript generation input. There is only one merge implementation, in .NET, so no cross-language fixture parity is required.
- Keep the existing `npm run test`, `lint`, `build`, and explicitly opt-in Playwright policy from this repository's [`AGENTS.md`](../AGENTS.md).

## Steps

- [ ] Add the Worker entry point and bindings: serve Vite assets, configure D1 and committed auth migrations, initialize Better Auth with GitHub + JWT/JWKS, and route API traffic to one sleeping `basic` CoreEx Container.
- [ ] Scaffold `Acn.Fde.Practice` with CoreEx's PostgreSQL API templates and remove/avoid unused reference-data, messaging, outbox, relay, subscriber, Redis, and domain-layer features.
- [ ] Implement the PostgreSQL state schema and migrations, CoreEx contracts/validators/service/repository/controllers, the 512 KiB body gate and closed-world recognition manifest, the merge-on-write transaction, authenticated ownership, JWT validation, health checks, and backend tests; publish OpenAPI and verify the handwritten frontend adapter against the running API.
- [ ] Implement the merge and its scenario tests in .NET (the cases and their expected outcomes are settled in #40, **except the `progress` rule, which #50 reversed** — merge `latestAnswers` per-question rather than deriving it, record `outcome` rather than #40's `abandoned` boolean per #51, and order attempt retention by `min(finishedAt, firstReceivedAt)` per #53), then build the framework-independent persistence module: v1-to-v2 migration, fixed guest/per-subject cache isolation, receipt omission, durable revision journal and canonical rollback point, single-flight scheduling, and send-and-rebase.
- [ ] Add the Better Auth client, thin React persistence hook, GitHub sign-in/out UI, single-flight in-memory token adapter, and typed state client — including first-sync consume ordering, session-loss quarantine, and strict flush-before-sign-out blocking from #56.
- [ ] Add the `Account` view as a fifth top-level nav item available to guests and signed-in users, holding sync state, the client-side JSON export, self-service reset, and account deletion; add the always-visible `TopNav` sync indicator, and keep it out of `ExamRunner`'s separate header. No modal, banner, or prompt anywhere invites sign-in (#50).
- [ ] Add the Aspire AppHost and its three profiles: provision PostgreSQL, gate API startup on CoreEx migrations, gate Worker startup on local D1 migrations and API readiness, run Vite behind the Worker proxy, forward user-secrets, publish dashboard links/health, and provide `dev:full` plus narrowly scoped local reset commands.
- [ ] Add the Aspire full-stack test project and test-only Better Auth entry/config; exercise the same-origin stack with isolated stores and no GitHub/network dependency, then add standard CI for TypeScript/.NET/AppHost/container validation.
- [ ] Add secret-safe production configuration, the one-time Worker-secret bootstrap helper, and the operator-run deployment script: preflight a clean current `main`; apply and ledger-check PostgreSQL then D1 migrations; re-check the active Worker version; deploy the singleton with an immediate Container rollout; run the one-minute anonymous health gate; and emit the secret-free release summary. Implement the stop/resume, partial-deploy rollback, and failed-health-reporting paths exactly as specified above.
- [ ] Update README and agent guidance with the new architecture, setup, exactly what is stored about a signed-in person, the 6-hour recovery window and the fact that client caches are the practical backup, $5 cost assumptions/limits, and operational troubleshooting; never commit GitHub, Better Auth, Cloudflare, or Neon credentials. Soften the current "No account, API, database, or backend" feature bullet rather than deleting it: sign-in is **optional** and the app remains offline-first and fully usable without an account (#50).

## Verification

This section fixes the verification coverage the build must provide, not the topology of its CI workflow. Exact jobs, runners, caching, parallelism, and service-container mechanics are implementation choices to make once the .NET solution and its tests exist; they are not load-bearing assumptions this spec needs to settle before the build starts.

### Fast local suites

- `npm run test`: frontend persistence, v1-to-v2 guest migration, cache isolation, first-sync interruption windows, receipt omission, mid-flight send-and-rebase, single-flight token refresh, strict sign-out blocking, permanent-rejection rollback, recognition-manifest consistency, and auth-state tests.
- `npm run test:worker`: Better Auth D1 adapter, JWT/JWKS, routing precedence, production exclusion of test auth, and local API-origin proxy tests in the Cloudflare Worker test runtime.
- `npm run lint && npm run build`: lint/type-check the handwritten frontend wire types/client and Worker, then build Vite assets.
- `dotnet test backend/Acn.Fde.Practice.slnx`: CoreEx validators/services/repositories/controllers plus the merge scenarios from #40 including idempotency; every #53 validation boundary and Problem Details code; 30 + 30 + abandoned-loser transient retention; future-clock retention; valid, expired, wrong-issuer/audience, and rotated-key JWTs; and authorization filters.

### Aspire full-stack suite

Run `npm run test:full` to start `Acn.Fde.Practice.Test.AppHost` with disposable PostgreSQL and local D1 stores, wait for migrations and all health checks, and test through the Vite origin:

1. Fetch the SPA and Worker/API health endpoints; assert unauthenticated practice APIs return 401.
2. Use the isolated Better Auth `testUtils` entry to create two users/sessions and obtain real short-lived JWTs from the local token endpoint.
3. Load a legacy v1 guest fixture through the browser migration, assert that only a schema-v2 envelope reaches `POST`, verify the canonical merged state, send it again, and prove the second write changed nothing.
4. Seed an existing account state and verify attempt/bookmark union, 30-attempt retention by bounded retention time, newest answer/active attempt, and tombstone behavior.
   Include the case #50 was resolved on: a state whose `latestAnswers` holds answers from attempts that have since fallen off the 30-attempt cap must survive the merge intact. Assert the answered count does **not** drop — that assertion is the regression test for the rule #40 originally specified.
5. Exercise GET and concurrent POSTs from two clients through the handwritten adapter, verify both contributions survive the merge with no lost update, and confirm its request/response shapes round-trip against the running API. Make another local edit while a POST is in flight and prove the returned canonical state becomes the base, the newer edit is replayed without its receipt, and the immediate next POST preserves both clients' contributions. Send representative `400`, `413`, and `415` requests and verify no merge occurs, normal account sync restores the last acknowledged state, and a rejected first sync restores the untouched guest state.
6. Call each user's token against the other's scenarios and verify ownership is always derived from `sub` with no cross-user reads/writes, and that `github_account_id` is never consulted for authorization.
7. Reset one user's practice state and verify the account survives; delete the other's account and verify the practice row goes first and the D1 identity follows.
8. Stop/restart the API resource, then PostgreSQL, and verify health transitions, queued client retry, and durable state recovery; repeat for the Worker/D1 process.
9. Run the AppHost `container` profile against the same cases, build from `backend/Dockerfile`, enforce a 1 GiB memory ceiling, and verify restart/sleep-equivalent process loss does not lose PostgreSQL state.

The integration profile deletes its temporary stores after the run and emits Aspire resource logs/traces on failure. It does not contact GitHub, Cloudflare, or Neon.

### Manual local acceptance

With local GitHub OAuth user-secrets configured, run `npm run dev:full`, open the frontend from the Aspire dashboard, and verify real GitHub sign-in/callback, a guest's first sync after signing in, reload, sign-out/cache isolation, offline guest practice, API/database outage messaging, OpenAPI, health, logs, traces, and clean recovery. Use the `container` profile once to check the production image locally.

Also verify the frontend-only behaviours from [#50](https://github.com/timbarreto/acn-fde/issues/50) and [#56](https://github.com/timbarreto/acn-fde/issues/56): a reload reads no cache until the subject resolves; a different subject and a guest see none of the prior account cache; an interrupted first sync recovers from both write-order windows; signing out erases the exact account key and the following guest session sees nothing of it; signing out with the API stopped remains blocked without discarding work; each agreed `TopNav` status and copy appears in its condition and stays absent for the whole duration of a timed attempt; and no modal, banner, or prompt invites sign-in anywhere in a full guest session, including after completing an exam.

### Deployment

Bootstrap the four runtime Worker secrets once, then exercise the production script from a clean checkout matching `origin/main`. Prove its PostgreSQL-first and D1-second migration gates, active-version re-check, immediate Container rollout, and secret-free summary. On a disposable target, force each partial-failure boundary and verify that migration failures stop for repair, a partially changed `wrangler deploy` restores the captured application version without reversing either database, and a completed deployment with failed health checks remains active while the script exits nonzero.

Against production, retry only the agreed anonymous gate for one minute: SPA plus `/health/live`, then `/health/startup` plus `/health/ready`. GitHub auth, authenticated practice APIs, a guest's first sync, five-minute sleep, and billing inspection are deliberately not deployment gates; the runtime and cost assumptions were already measured by [#42](https://github.com/timbarreto/acn-fde/issues/42). Do not run the existing Playwright QA suite without explicit approval; if browser automation is later desired, obtain approval and point it at the isolated Aspire integration profile.
