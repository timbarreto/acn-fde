# ACN FDE CoreEx backend and Better Auth plan

> **Status: approved specification, not yet implemented.** This document
> records the approved design for a CoreEx-based backend and Better Auth
> authentication layer. It describes target architecture and an ordered
> implementation checklist; none of the described code, infrastructure, or
> configuration exists in this repository yet. See [`AGENTS.md`](../AGENTS.md)
> for the current (client-only) architecture, which remains authoritative
> until this plan is implemented.

## Context

ACN FDE is currently a client-only React 19/Vite application with all progress stored in browser `localStorage`; its project guidance explicitly says there is no backend, API, database, or account system.
The requested change introduces a CoreEx-based backend and Better Auth authentication while preserving guest/offline use. The selected design is a roughly US$5/month Cloudflare-centric deployment, with GitHub-only sign-in and an idempotent newest-wins import of existing anonymous progress.

## Approach

### Deployment topology

Evolve the existing Cloudflare static-assets Worker into the single same-origin entry point:

- `/api/auth/*` runs a small TypeScript Better Auth service with GitHub as the only provider and D1 for auth/session/JWKS tables.
- `/api/*` forwards to one stateless CoreEx ASP.NET API in a Cloudflare `basic` Container (1 GiB), configured to sleep after roughly 5 minutes of inactivity.
- All other requests continue to use the existing Vite `dist/` static-assets binding and SPA fallback.
- The CoreEx container uses a free-tier managed PostgreSQL database (initial target: Neon Free) because PostgreSQL is a supported CoreEx template path and D1 is not a native .NET/CoreEx provider.

This should hold the deployment near the selected **US$5/month Workers Paid minimum** while traffic is low and the container sleeps. D1, static assets, Worker requests, and the Container Durable Object should remain inside included allowances; add Cloudflare billing/CPU limits and monitor container hours, memory, and Neon free-tier usage. Do not try to host ASP.NET directly in the Workers runtime or persist data on the container's ephemeral disk.

### Authentication contract

Keep Better Auth's browser session in a secure, HTTP-only, same-site cookie. Enable Better Auth's JWT/JWKS plugin; after session establishment, the frontend requests a short-lived API JWT and keeps it in memory rather than `localStorage`. The CoreEx API uses ASP.NET `JwtBearer` validation against Better Auth's JWKS and validates signature, issuer, audience, and expiry before mapping `sub` (the stable Better Auth user ID) into CoreEx `ExecutionContext`. Every practice-data query derives ownership from that authenticated subject; no endpoint accepts a user ID from the client. Basic health probes remain anonymous, while detailed diagnostics and data endpoints require authorization.

### Persistence and import

Extract the current `localStorage` logic from `App.tsx` behind a persistence/sync layer while leaving `PersistedState` as the UI-facing model:

- Guest mode remains fully local and offline-capable. Read the legacy `agentic-ready-gh600-v1` key as the migration source, then use a versioned guest envelope containing a stable import ID and sync-only timestamps.
- Account mode uses a per-user local cache, optimistic local updates, and retryable synchronization so a temporary auth/API/database outage does not break practice. Never expose one account's cache to a guest or another account.
- On first successful GitHub sign-in, POST the guest snapshot and stable import ID to an import endpoint. In one PostgreSQL transaction, record a unique `(user, importId)` receipt and merge only once: union attempts by ID and bookmarks, retain the 30 newest completed attempts, and use sync timestamps to select the newest active attempt and per-question answer. Derive timestamps for legacy records from their attempt times; a legacy answer without provenance receives the import time.
- Return the canonical merged state. Only after that response succeeds should the browser mark/remove the guest import source and switch to the per-account cache. Failed or interrupted imports keep guest data intact and retry with the same import ID.
- Store sync timestamps and bookmark tombstones outside the exam-facing model so newest-wins conflict handling also supports bookmark removals and later cross-device ETag conflicts.

### CoreEx API and data model

Scaffold the smallest CoreEx API-only solution as `backend/Acn.Fde.Practice`: PostgreSQL enabled, with reference data, messaging, outbox, subscribers, relay, and a DDD domain project omitted. Use a `practice_state` row per Better Auth subject containing the validated state JSON, sync metadata, ETag, and change log, plus a `practice_import` receipt table for idempotency. Expose authenticated `GET`/conditional `PUT` state operations and the transactional import operation, using CoreEx contracts, validators, application service, EF repository/unit of work, ProblemDetails/exception mapping, execution context, ETags, OpenAPI, and health checks. The frontend handles `409`/ETag conflicts by applying the same deterministic newest-wins merge and retrying with an idempotency key.

### Public API, concrete types, and end-to-end call stacks

#### Wire and backend types

The CoreEx OpenAPI document is the source for generated camel-case TypeScript interfaces in `src/lib/practice-api.ts`; handwritten UI types are mapped at the client boundary rather than imported into Worker/backend code.

| Wire/TypeScript shape | C# contract/application type | PostgreSQL persistence type |
|---|---|---|
| `ActiveAttemptDto` / `CompletedAttemptDto` (IDs and enums as strings, answer maps, flags, indexes, epoch-millisecond timestamps) | `ActiveAttempt` / `CompletedAttempt` in `Acn.Fde.Practice.Contracts` using `string`, `Dictionary<string, string[]>`, `List<string>`, `int`, `long`, and nullable `long` | Nested JSON inside `PracticeStateEntity.StateJson : JsonElement` (`jsonb`) |
| `PracticeStateDto { activeAttempt, attempts, bookmarks, progress }` | `PracticeState` with `ActiveAttempt?`, `List<CompletedAttempt>`, `List<string>`, and `Dictionary<string, string[]>` | `PracticeStateEntity.StateJson : JsonElement` (`state jsonb`) |
| `BookmarkVersionDto { isBookmarked, updatedAt }` | `BookmarkVersion { bool IsBookmarked; DateTimeOffset UpdatedAt; }` | Nested JSON inside `PracticeStateEntity.SyncMetadataJson` |
| `PracticeSyncMetadataDto { activeAttemptUpdatedAt, attemptUpdatedAt, progressUpdatedAt, bookmarks }` | `PracticeSyncMetadata` using nullable `DateTimeOffset` plus `Dictionary<string, DateTimeOffset>` and `Dictionary<string, BookmarkVersion>` | `PracticeStateEntity.SyncMetadataJson : JsonElement` (`sync_metadata jsonb`) |
| `PracticeStateSnapshotDto { schemaVersion, state, sync, etag }` | `PracticeStateSnapshot : IETag` with `int SchemaVersion`, `PracticeState State`, `PracticeSyncMetadata Sync`, and read-only `string? ETag` | Application `StoredPracticeState { string UserId; PracticeStateSnapshot Snapshot; string? ETag; ChangeLog? ChangeLog; }` mapped to one `PracticeStateEntity` |
| `ImportPracticeStateRequestDto { importId, snapshot }` | `ImportPracticeStateRequest { Guid ImportId; PracticeStateSnapshot Snapshot; }` | Application `ImportReceipt { string UserId; Guid ImportId; DateTimeOffset ImportedOn; }` mapped to `PracticeImportEntity` |

Concrete persistence models under `Acn.Fde.Practice.Infrastructure.Persistence` are:

- `PracticeStateEntity : IETag, IChangeLog`: `string UserId`, `JsonElement StateJson`, `JsonElement SyncMetadataJson`, `string? ETag`, and CoreEx `ChangeLog` fields (`CreatedBy/On`, `UpdatedBy/On`).
- `PracticeImportEntity`: `string UserId`, `Guid ImportId`, and `DateTimeOffset ImportedOn`.
- `PracticeDbContext : DbContext, IEfDbContext`: maps JSON with `JsonElementStringEfConverter`, maps `ETag` to PostgreSQL's hidden `xmin xid` using `PostgresDatabase.RowVersionConverter`, and applies the composite import key.
- `PracticeEfDb : EfDb<PracticeDbContext>`: exposes `EfDbModel<PracticeStateEntity> PracticeStates` and `EfDbModel<PracticeImportEntity> PracticeImports`.
- `PracticeStateMapper`: the only serializer boundary, using the shared `JsonSerializerOptions` to convert contract objects to/from `JsonElement`; malformed persisted JSON is treated as a server/data-integrity error, never silently reset.

The checked-in migration creates this physical schema (PostgreSQL supplies `xmin`; it is mapped, not declared):

```sql
CREATE SCHEMA IF NOT EXISTS practice;
CREATE TABLE practice.practice_state (
  user_id varchar(128) PRIMARY KEY,
  state jsonb NOT NULL,
  sync_metadata jsonb NOT NULL,
  created_by varchar(250) NOT NULL,
  created_on timestamptz NOT NULL,
  updated_by varchar(250) NOT NULL,
  updated_on timestamptz NOT NULL
);
CREATE TABLE practice.practice_import (
  user_id varchar(128) NOT NULL REFERENCES practice.practice_state(user_id) ON DELETE CASCADE,
  import_id uuid NOT NULL,
  imported_on timestamptz NOT NULL,
  PRIMARY KEY (user_id, import_id)
);
```

#### Public endpoint inventory

Only these application routes are public; the Worker explicitly allowlists the Better Auth routes and returns 404 for unused auth methods.

| Method and route | Request type | Success type | Auth/storage |
|---|---|---|---|
| `POST /api/auth/sign-in/social` | Better Auth `{ provider: "github", callbackURL }` | GitHub redirect response | Anonymous; Better Auth/D1 |
| `GET /api/auth/callback/github` | OAuth query (`code`, `state`) | Session cookie + frontend redirect | Anonymous callback; GitHub then Better Auth/D1 |
| `GET /api/auth/get-session` | HTTP-only session cookie | Better Auth `{ user, session }` | Better Auth/D1 |
| `POST /api/auth/sign-out` | Session cookie + Better Auth CSRF/origin checks | Empty success + cleared cookie | Better Auth/D1 |
| `GET /api/auth/token` | Session cookie | `{ token: string }` short-lived JWT | Better Auth D1 session + JWT signing key |
| `GET /api/auth/jwks` | None | Standard `JsonWebKeySet` | Better Auth D1 signing keys; consumed by ASP.NET |
| `GET /api/practice-state` | Bearer JWT | `PracticeStateSnapshotDto` + `ETag` header when stored | CoreEx/PostgreSQL |
| `PUT /api/practice-state` | Bearer JWT, `If-Match`, `PracticeStateSnapshotDto` | Canonical `PracticeStateSnapshotDto` + new `ETag` | CoreEx/PostgreSQL |
| `POST /api/practice-state/import` | Bearer JWT, `ImportPracticeStateRequestDto` | Canonical merged `PracticeStateSnapshotDto` + `ETag` | CoreEx/PostgreSQL transaction |
| `GET /health/live`, `/health/startup`, `/health/ready` | None | ASP.NET health status | Container/process; readiness checks PostgreSQL |

`GET` returns an empty schema-v2 snapshot with no ETag when no row exists. The frontend always performs the import call—even for an empty guest—before its first `PUT`, so CoreEx's normal PUT precondition can require `If-Match`. Errors use CoreEx `ProblemDetails`: 400 validation, 401 auth, 409 concurrency/duplicate race, 428 missing ETag, and 503 readiness/dependency failure.

#### Authentication call stacks

- **GitHub sign-in:** React `authClient.signIn.social()` -> Vite proxy (local only) -> `worker/index.ts: fetch(Request, Env)` -> route allowlist -> `createAuth(env).handler(request)` -> Better Auth GitHub provider writes/reads its typed `user`, `account`, `session`, and `verification` records through `Env.AUTH_DB : D1Database` -> callback sets secure session cookie -> React calls `authClient.getSession()`.
- **API token:** React `authClient.token()` -> Better Auth handler -> session-cookie lookup in D1 -> JWT plugin reads the D1 `jwks` row and signs claims (`sub` Better Auth user ID, `iss`, `aud`, `iat`, `exp`) -> `{ token }` remains in the in-memory frontend auth store.
- **JWT validation:** `Authorization: Bearer` reaches the container -> ASP.NET `JwtBearerHandler` obtains/caches `/api/auth/jwks`, verifies signature/issuer/audience/expiry -> `ClaimsPrincipal` -> an execution-context mapper creates CoreEx `AuthenticationUser { Id = sub, UserName = name, Type = AccountUser }` -> `UseExecutionContext()` makes that identity available to every service/repository call. A client-supplied user ID is never present in any practice request contract.

#### `GET /api/practice-state` call stack

```text
React PracticeStateStore.loadAccount()
  -> generated PracticeApi.getPracticeState(): Promise<PracticeStateSnapshotDto>
  -> fetch GET /api/practice-state + Bearer token
  -> Worker fetch() -> getContainer(env.COREEX, "api").fetch(request)
  -> JwtBearerHandler -> ClaimsPrincipal -> CoreEx ExecutionContext
  -> PracticeStateController.GetAsync()
  -> WebApi.GetWithResultAsync<PracticeStateSnapshot>()
  -> IPracticeStateService.GetAsync(CancellationToken)
  -> PracticeStateService.GetAsync() reads ExecutionContext.Current.User.Id
  -> IPracticeStateRepository.GetAsync(string userId, CancellationToken)
  -> PracticeStateRepository.GetAsync()
  -> PracticeEfDb.PracticeStates.GetAsync(userId)
  -> PracticeDbContext -> NpgsqlDataSource("Postgres")
  -> SELECT xmin, state, sync_metadata, audit columns
       FROM practice.practice_state WHERE user_id = @sub
  -> PracticeStateEntity -> PracticeStateMapper -> StoredPracticeState
  -> Result<PracticeStateSnapshot> -> WebApi
  -> JSON body + quoted ETag header -> Worker pass-through -> generated client
  -> mapper to UI PersistedState + per-user local envelope
```

The service creates only an in-memory empty snapshot when no row exists; it does not write during GET.

#### `PUT /api/practice-state` call stack

```text
React local mutation -> PersistedState + sync clocks/tombstones
  -> generated PracticeApi.putPracticeState(snapshot, ifMatch)
  -> Worker -> Container -> JWT/ExecutionContext
  -> PracticeStateController.PutAsync()
  -> WebApi.PutWithResultAsync<PracticeStateSnapshot, PracticeStateSnapshot>()
     (WebApi copies If-Match into request.ETag and rejects a missing ETag)
  -> PracticeStateSnapshotValidator.ValidateWithResultAsync()
     (schema v2, max 30 attempts, bounded IDs/maps/payload, valid timestamps/enums)
  -> IPracticeStateService.UpdateAsync(PracticeStateSnapshot, ct)
  -> IUnitOfWork.TransactionAsync(...)
  -> IPracticeStateRepository.UpdateAsync(userId from ExecutionContext, snapshot, ct)
  -> repository loads PracticeStateEntity, compares contract ETag, maps DTOs to JsonElement
  -> PracticeEfDb.PracticeStates.UpdateWithResultAsync(entity)
  -> EF/Npgsql logical SQL:
       UPDATE practice.practice_state
       SET state=@jsonb, sync_metadata=@jsonb,
           updated_by=@sub, updated_on=@now
       WHERE user_id=@sub AND xmin=@decodedEtag
       RETURNING xmin
  -> zero rows / DbUpdateConcurrencyException -> CoreEx ConcurrencyException -> 409 ProblemDetails
  -> success commits PostgresUnitOfWork, maps returned xmin to string ETag
  -> canonical PracticeStateSnapshot + ETag -> client cache
```

If the first response is lost, replaying the old ETag yields 409 rather than a second side effect; the client GETs, runs the checked-in deterministic merge, and retries with the current ETag. No container-memory idempotency cache is relied upon.

#### `POST /api/practice-state/import` call stack

```text
Legacy guest envelope -> ImportPracticeStateRequestDto(importId, snapshot)
  -> generated PracticeApi.importPracticeState()
  -> Worker -> Container -> JWT/ExecutionContext
  -> PracticeStateController.ImportAsync()
  -> WebApi.PostWithResultAsync<ImportPracticeStateRequest, PracticeStateSnapshot>()
  -> ImportPracticeStateRequestValidator + nested snapshot validator
  -> IPracticeStateService.ImportAsync(request, ct)
  -> IUnitOfWork.TransactionAsync(...)
  -> IPracticeStateRepository.GetImportAsync(@sub, importId)
     -> SELECT user_id, import_id FROM practice.practice_import
        WHERE user_id=@sub AND import_id=@importId
  -> if receipt exists: read current state and return it without merging
  -> otherwise GetForUpdateAsync(@sub)
     -> SELECT xmin, state, sync_metadata, audit columns
        FROM practice.practice_state WHERE user_id=@sub FOR UPDATE
  -> PracticeStateMapper -> existing snapshot (or empty)
  -> IPracticeStateMerger.Merge(existing, incoming)
     -> union/dedupe/cap/newest-wins using shared fixtures
  -> repository INSERTs a new state or UPDATEs the existing row through PracticeEfDb
  -> repository INSERTs PracticeImportEntity(@sub, importId, now)
  -> PostgresUnitOfWork COMMIT atomically
  -> duplicate/concurrency race rolls back both writes; service re-reads receipt/state on retry
  -> canonical snapshot + mapped xmin ETag -> browser
  -> browser marks guest import acknowledged only after the response is stored
```

`IPracticeStateRepository` therefore exposes typed `GetAsync`, `GetForUpdateAsync`, `UpdateAsync`, `CreateAsync`, `GetImportAsync`, and `CreateImportAsync` methods; no controller or service receives `PracticeStateEntity`, `DbContext`, `NpgsqlConnection`, SQL, or D1 types.

#### Health/readiness call stack

`/health/live` checks only the ASP.NET process; `/health/startup` confirms configuration/JWKS settings are structurally valid without requiring a live GitHub call; `/health/ready` -> ASP.NET health middleware -> Aspire Npgsql health check -> `NpgsqlDataSource` -> `SELECT 1`. Detailed health output remains authorization-protected and is not used by Cloudflare's anonymous probe.

### Complete local setup and Aspire integration

Add `Acn.Fde.Practice.AppHost` as the one-command local orchestrator, following the pattern of CoreEx's [`samples/aspire/Contoso.Aspire`](https://github.com/Avanade/CoreEx/tree/main/samples/aspire/Contoso.Aspire) reference AppHost. Local development uses no Cloudflare or Neon resources and has this explicit dependency graph:

```text
Aspire PostgreSQL container -> PostgreSQL migration resource -> CoreEx API
local Wrangler D1 migration resource -------------------------> Better Auth/router Worker
CoreEx API ----------------------------------------------------> Better Auth/router Worker
Better Auth/router Worker ------------------------------------> Vite frontend
```

- **Prerequisites:** .NET 10 SDK, Docker, Node/npm, and the repo-pinned Wrangler package. Run `npm ci` and `dotnet restore backend/Acn.Fde.Practice.slnx` once after checkout; AppHost starts services but never installs dependencies.
- **PostgreSQL:** AppHost provisions PostgreSQL with an Aspire-managed development volume and an `acn_fde_practice` database. `WithReference` injects the `Postgres` connection string expected by CoreEx's existing `AddNpgsqlDataSource("Postgres")` wiring. A one-shot CoreEx Database-tool resource applies checked-in migrations; the API uses `WaitForCompletion` and starts only after PostgreSQL is healthy and migration succeeds.
- **Better Auth/D1:** a separate one-shot executable runs `wrangler d1 migrations apply ... --local` against a repo-local ignored D1 directory. The local Worker waits for it, then runs `wrangler dev` on port 8787. No public migration endpoint is introduced.
- **API routing:** production `wrangler.jsonc` uses the Cloudflare Container binding. A separate `wrangler.local.jsonc` omits Containers and sends `/api/*` to the AppHost-provided `COREEX_API_ORIGIN`; both configurations execute the same Worker routing and Better Auth code. The API can start before the Worker because JWKS retrieval is lazy, and validates tokens against the local Worker's JWKS URL once requests begin.
- **Frontend:** AppHost starts Vite on port 5173 with HMR. Vite proxies `/api`, `/api/auth`, and local test-only paths to the Worker, so the browser always exercises the same-origin topology. The development GitHub OAuth callback is `http://localhost:5173/api/auth/callback/github`.
- **Secrets:** store the local GitHub OAuth client ID/secret and Better Auth secret in AppHost .NET user-secrets; AppHost forwards them only to the Worker process. PostgreSQL uses Aspire-generated local credentials. Cloudflare, production Better Auth, and Neon secrets are not required locally and never enter committed files.
- **Dashboard/observability:** expose frontend, Worker, API/OpenAPI, and anonymous API readiness links in the Aspire dashboard. CoreEx API logs, traces, metrics, health, PostgreSQL dependency spans, and migration status flow to Aspire; Wrangler/Vite stdout and health are visible as process resources, without claiming unsupported Worker OTLP parity.
- **Profiles:** the default `dev` profile keeps PostgreSQL/D1 state for iterative work; an `integration` profile uses isolated temporary storage, random non-OAuth ports, and a test-only auth entry point; a `container` profile replaces the API project resource with the production Dockerfile to verify Linux/container behavior while still using local PostgreSQL and D1.
- **One-command flow:** `npm run dev:full` launches AppHost; AppHost runs both migration gates, starts API -> Worker -> Vite, and prints the Aspire dashboard/front-end URLs. Ctrl-C stops the graph without deleting development data. Document explicit `db:reset:local` commands that remove only the named local Aspire/D1 stores after confirmation.

For automated full-stack tests, create `Acn.Fde.Practice.Test.AppHost` with `Aspire.Hosting.Testing`. It launches the isolated `integration` profile, waits for every resource's health state, and calls the application through the Vite/Worker same-origin URL. A separate Worker test entry uses Better Auth's `testUtils` server-side helpers to create sessions; it is referenced only by `wrangler.test.jsonc`, binds to localhost, exposes no production route, and is excluded from the production bundle/config.

## Files to modify

- Frontend/runtime: `package.json`, `package-lock.json`, `vite.config.ts`, `wrangler.jsonc`, `.gitignore`
- Frontend state/auth: `src/App.tsx`, `src/types.ts`, new `src/lib/persistence.ts`, `src/lib/auth-client.ts`, generated `src/lib/practice-api.ts`, and focused Vitest files
- Shared contracts: new `contracts/` JSON merge fixtures and the backend OpenAPI document used to detect TypeScript client drift
- Cloudflare Worker: new `worker/index.ts`, `worker/auth.ts`, test-only auth entry, Worker tests, generated binding types, committed `migrations/*.sql`, plus `wrangler.local.jsonc` and `wrangler.test.jsonc`
- CoreEx contracts/API: new `backend/src/Acn.Fde.Practice.Contracts/PracticeState*.cs`, `backend/src/Acn.Fde.Practice.Api/Controllers/PracticeStateController.cs`, JWT/execution-context host wiring, OpenAPI, and health configuration
- CoreEx application/infrastructure: new `PracticeStateService`, validators, `IPracticeStateRepository`, `IPracticeStateMerger`, `StoredPracticeState`, `PracticeStateRepository`, `PracticeStateMapper`, `PracticeStateEntity`, `PracticeImportEntity`, `PracticeDbContext`, and `PracticeEfDb` under the generated Application/Infrastructure projects
- CoreEx solution/storage: new `backend/Acn.Fde.Practice.slnx`, Database migration/tool and Test projects, plus `backend/Dockerfile`
- Aspire: new `backend/src/Acn.Fde.Practice.AppHost/` and `backend/tests/Acn.Fde.Practice.Test.AppHost/` projects defining dev, integration, and container resource graphs
- Local/CI/deployment: npm/Aspire orchestration scripts, ignored local D1 storage, a normal non-Playwright CI workflow, secret/environment examples, and deployment scripts
- Guidance: `README.md`, `AGENTS.md`, and `CLAUDE.md` to replace the obsolete client-only architecture and commands

## Reuse

- Preserve `PersistedState`, `ActiveAttempt`, and `CompletedAttempt` from `src/types.ts`; reuse `progressFromAttempts` in `src/lib/exam.ts` when deriving legacy progress chronology.
- Evolve the existing static-assets deployment in `wrangler.jsonc` rather than creating a second public origin.
- Scaffold with CoreEx's `coreex` + `coreex-api` templates and reuse the PostgreSQL, API host, execution-context, ETag, validation, repository, health, OpenAPI, and test patterns documented in the upstream [Avanade/CoreEx](https://github.com/Avanade/CoreEx) repository, specifically the [`CoreEx.Template`](https://github.com/Avanade/CoreEx/tree/main/src/CoreEx.Template) project, the [application scaffolding guide](https://github.com/Avanade/CoreEx/blob/main/docs/application-scaffolding-guide.md), and the [consumer instructions](https://github.com/Avanade/CoreEx/tree/main/consumer-instructions). This repository has no local CoreEx checkout; treat these as external references only, and pin/record the CoreEx release or commit actually used once implementation starts.
- Reuse Better Auth's supported D1 database path and JWT/JWKS plugin rather than inventing sessions or sharing the D1 schema with .NET.
- Generate the frontend API client from the CoreEx/NSwag OpenAPI contract, and run the same checked-in merge fixtures through TypeScript and .NET tests so the two implementations cannot silently diverge.
- Keep the existing `npm run test`, `lint`, `build`, and explicitly opt-in Playwright policy from this repository's [`AGENTS.md`](../AGENTS.md).

## Steps

- [ ] Add the Worker entry point and bindings: serve Vite assets, configure D1 and committed auth migrations, initialize Better Auth with GitHub + JWT/JWKS, and route API traffic to one sleeping `basic` CoreEx Container.
- [ ] Scaffold `Acn.Fde.Practice` with CoreEx's PostgreSQL API templates and remove/avoid unused reference-data, messaging, outbox, relay, subscriber, Redis, and domain-layer features.
- [ ] Implement the PostgreSQL state/import schema and migrations, CoreEx contracts/validators/service/repository/controllers, ETag/idempotency behavior, authenticated ownership, JWT validation, health checks, and backend tests; publish OpenAPI and generate the frontend client with a CI drift check.
- [ ] Specify deterministic merge cases as shared JSON fixtures, then extract/version frontend persistence and add guest/per-user cache isolation, sync metadata/tombstones, atomic legacy import behavior, and matching TypeScript/.NET tests.
- [ ] Add the Better Auth client, GitHub sign-in/out UI, in-memory API token flow, typed state client, optimistic account sync/retry/conflict handling, and accurate guest/account/offline status messaging.
- [ ] Add the Aspire AppHost and its three profiles: provision PostgreSQL, gate API startup on CoreEx migrations, gate Worker startup on local D1 migrations and API readiness, run Vite behind the Worker proxy, forward user-secrets, publish dashboard links/health, and provide `dev:full` plus narrowly scoped local reset commands.
- [ ] Add the Aspire full-stack test project and test-only Better Auth entry/config; exercise the same-origin stack with isolated stores and no GitHub/network dependency, then add standard CI for TypeScript/.NET/AppHost/container validation.
- [ ] Add secret-safe production configuration and a manual Cloudflare deployment sequence that applies both D1 and PostgreSQL migrations before `wrangler deploy`.
- [ ] Update README and agent guidance with the new architecture, setup, data ownership, $5 cost assumptions/limits, backup implications, and operational troubleshooting; never commit GitHub, Better Auth, Cloudflare, or Neon credentials.

## Verification

### Fast local suites

- `npm run test`: frontend persistence/import/merge/auth-state tests and shared JSON merge fixtures.
- `npm run test:worker`: Better Auth D1 adapter, JWT/JWKS, routing precedence, production exclusion of test auth, and local API-origin proxy tests in the Cloudflare Worker test runtime.
- `npm run lint && npm run build`: lint/type-check frontend and Worker, build Vite assets, and detect generated OpenAPI client drift.
- `dotnet test backend/Acn.Fde.Practice.slnx`: CoreEx validators/services/repositories/controllers plus the same merge fixtures; valid, expired, wrong-issuer/audience, and rotated-key JWTs; ETags, import receipts, and authorization filters.

### Aspire full-stack suite

Run `npm run test:full` to start `Acn.Fde.Practice.Test.AppHost` with disposable PostgreSQL and local D1 stores, wait for migrations and all health checks, and test through the Vite origin:

1. Fetch the SPA and Worker/API health endpoints; assert unauthenticated practice APIs return 401.
2. Use the isolated Better Auth `testUtils` entry to create two users/sessions and obtain real short-lived JWTs from the local token endpoint.
3. Import a v1 guest fixture, verify the canonical merged state, retry the same import ID, and prove no duplicate mutation occurred.
4. Seed an existing account state and verify attempt/bookmark union, 30-attempt retention, newest answer/active attempt, and tombstone behavior.
5. Exercise GET/PUT with ETags, force a two-client conflict, run the deterministic merge/retry, and confirm the generated client matches OpenAPI.
6. Call each user's token against the other's scenarios and verify ownership is always derived from `sub` with no cross-user reads/writes.
7. Stop/restart the API resource, then PostgreSQL, and verify health transitions, queued client retry, and durable state recovery; repeat for the Worker/D1 process.
8. Run the AppHost `container` profile against the same cases, build from `backend/Dockerfile`, enforce a 1 GiB memory ceiling, and verify restart/sleep-equivalent process loss does not lose PostgreSQL state.

The integration profile deletes its temporary stores after the run and emits Aspire resource logs/traces on failure. It does not contact GitHub, Cloudflare, or Neon.

### Manual local acceptance

With local GitHub OAuth user-secrets configured, run `npm run dev:full`, open the frontend from the Aspire dashboard, and verify real GitHub sign-in/callback, guest-to-account import, reload, sign-out/cache isolation, offline guest practice, API/database outage messaging, OpenAPI, health, logs, traces, and clean recovery. Use the `container` profile once to check the production image locally.

### Deployment

Apply D1 and PostgreSQL migrations, run `wrangler deploy --dry-run` where Container support permits, deploy one `basic` instance, verify secrets are injected only at runtime, smoke-test GitHub auth/import/API/cold start, wait at least five idle minutes and confirm sleep/restart without state loss, then inspect billing limits and actual container memory/hours. Do not run the existing Playwright QA suite without explicit approval; if browser automation is later desired, obtain approval and point it at the isolated Aspire integration profile.
