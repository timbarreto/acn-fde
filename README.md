# Agentic Ready — GH-600 Practice

An unofficial, offline-first practice exam for the **GitHub Certified: Agentic AI Developer (GH-600)** credential.

## What is included

- A 100-question local bank covering all six published GH-600 domains
- Full, quick, and focused-domain practice modes, with multi-domain selection for drills and quick checks
- Question queues that put never-answered questions first, then least-recently-answered, across all modes
- Timed attempts with pausable countdowns, question navigation, and flags
- Single-answer and multiple-answer scenarios
- Per-domain scoring, answer explanations, and source links
- Instant feedback that reveals the correct answer and explanation as you check each question
- Finished-attempt history with submitted, expired, and abandoned outcomes, plus bookmarks, incorrect-answer review, and resume support with automatic timer pausing on exit
- A focused study sequence mapped to the published exam domains
- Refresh-stable, deep-linkable pages with browser Back and Forward navigation
- No account required; standalone guest practice remains browser-only and offline-first
- An Account destination alongside the other top-level pages, with a passive sync indicator that identifies a signed-in user by GitHub avatar and username, client-generated JSON export, self-service practice-state reset, ordered account deletion, optional GitHub sign-in, safe sign-out, and cross-device practice when the optional full stack is running
- Candidate-interface language support for English, Spanish, and German. The choice is saved in this browser only, is never synced with an account, and does not require sign-in. Question-bank prompts, options, objectives, explanations, and source labels stay in English.

## Stack

- React 19 + TypeScript
- Vite
- Tailwind CSS
- shadcn/ui components built on Radix primitives
- Lucide icons
- Browser `localStorage`
- Cloudflare Workers runtime for the optional same-origin stack, with a singleton production CoreEx Container
- .NET 10, CoreEx, Aspire, and PostgreSQL 18 for backend development

## Run locally

```bash
npm install
npm run dev
```

Open the URL printed by Vite (normally `http://localhost:5173`).

This standalone command starts the complete guest application without Podman,
.NET, PostgreSQL, or any backend service.

## Guest and account modes

Guest practice is permanent, complete, browser-only, and offline-first. GitHub
sign-in is optional and adds cross-device synchronization and recovery after
browser data is cleared; it never unlocks practice features. Account caches are
keyed only by the authenticated subject, and a lost session hides and
quarantines its cache until the same subject signs in again.

Practice edits are saved locally before syncing. Each signed-in device therefore
holds a practical backup, but server loss plus loss of every browser cache is
total loss; Neon Free provides only a six-hour recovery window. Account offers
client-side export, subject-isolated reset, safe sign-out, and practice-first
account deletion. Interface language is chosen on Account for guests and signed-in
candidates alike; it stays in this browser and is independent of practice-state
sync. See the [candidate account guide](docs/account-system.md) for
what is stored, recovery behavior, data controls, and preview-auth limitations.

## Run the full stack locally

The full-stack path requires Podman and the exact .NET SDK version pinned in
`global.json`, which disables roll-forward, so every `dotnet` command in this
repository refuses a different .NET 10 patch. Install dependencies once. For
real local GitHub sign-in, configure the separate localhost OAuth app and local
Better Auth secret before starting the graph:

```bash
npm ci
dotnet restore backend/Acn.Fde.Practice.slnx
./setup-github-secrets.sh --local
npm run dev:full
```

The helper stores values in unencrypted .NET user-secrets outside the
repository. The isolated automated stack supplies test-only identity values and
does not require local GitHub credentials.

Start a Podman machine first on Windows or macOS. The AppHost selects Podman
explicitly on every platform; its published container ports must be reachable
from the host for Aspire health checks.

Open `http://localhost:5173`. Aspire starts PostgreSQL 18.4, applies the
checked-in CoreEx and local D1 migrations, starts the trimmed CoreEx API, and
then starts Vite with its Worker in workerd. The Worker serves the application
and forwards `/api*` and `/health*` on that same origin to CoreEx.

The health endpoints are reachable in the local and isolated test stacks only.
They have separate meanings:

- `/health/live` reports only process liveness.
- `/health/startup` reports whether application initialization completed.
- `/health/ready` evaluates current PostgreSQL readiness when requested.

No application timer polls readiness. Ctrl-C stops the full development graph;
the named Aspire PostgreSQL volume is retained for the next run.

The Worker also owns the GitHub-only session boundary. Its D1 schema is
versioned under `worker/migrations/` and is applied automatically by
`npm run dev:full`. Apply it manually only when exercising the Worker without
Aspire:

```bash
npm run auth:migrate:local
```

Auth routes use secure, HTTP-only Better Auth session cookies and expose a
short-lived ES256 identity token for CoreEx. CoreEx authorizes only the opaque
Better Auth subject; the GitHub account ID in the token is recovery metadata,
not an authorization identifier. Authenticated `GET`, `POST`, and `DELETE`
`/api/practice-state` load, merge, and delete a validated schema-v2 envelope in
PostgreSQL. When the full-stack browser resolves an established session, it
syncs guest practice state into a cache keyed only by that authenticated
subject. Account edits are journaled locally before a debounced or
milestone-triggered single-flight sync, then rebased over each canonical
server response so edits made during a request and changes from other devices
both survive. Token refresh is shared and bounded, lost sessions quarantine
unsynced account work and hold navigation on Account until the same GitHub
account signs in again, permanent rejections restore the last accepted state,
and safe sign-out never discards pending changes. The Account destination is the
only place that invites GitHub sign-in and performs safe sign-out; a passive
sync indicator reports guest, syncing, synced, offline, attention, and
signing-out states in the top navigation everywhere except a timed attempt.
Standalone guest practice remains unchanged: the Account page is still
reachable, and it explains that sign-in needs the optional full stack.

## Export, reset, and account deletion

Account can download a client-generated JSON export of the practice state
currently visible in the browser. Export is available to guests and users and
never sends data to a new endpoint.

Reset explicitly removes finished attempts, bookmarks, and latest answers. A
guest reset removes and recreates only `agentic-ready-gh600-v2:guest`. A user
reset waits for `DELETE /api/practice-state` to succeed, clears only that
subject's browser cache, and keeps the signed-in identity.

Account deletion performs the same practice-state deletion first and calls
Better Auth only after it succeeds. If identity deletion fails, the browser
keeps only an empty, subject-scoped continuation marker; Account stays pinned
until the candidate retries the unfinished identity step. Successful deletion
clears that subject's cache and starts a new empty guest practice state.

Better Auth stores the opaque subject, GitHub display name, username, avatar
URL, email, and GitHub account ID needed for identity and recovery. The GitHub
access token is cleared after sign-in because the application does not call the
GitHub API.

## Exercise the signed-in full stack

After installing the local prerequisites above, one command launches and tests
the complete signed-in path:

```bash
npm run test:full
```

The harness creates a PostgreSQL container over a unique temporary data
directory and a unique temporary local D1 store, applies both sets of real
migrations, and waits for Aspire resource health. It then uses same-origin HTTP
to verify application and API health, reject an unauthenticated practice-state
request with `401`, issue real short-lived identity tokens for two independent
test subjects, and prove that each subject can save, load, reset, and delete
only its own state while practice data is removed before the selected identity.

No GitHub credentials, Cloudflare service, hosted database, or fixed readiness
delay is involved. Identity issuance lives behind a separate integration-only
Worker entry point; the production Worker explicitly returns `404` for every
test-auth path. The harness stops all Aspire resources and deletes both
temporary stores after either success or failure. On failure, it also writes the
PostgreSQL, migration, CoreEx, and Worker resource logs to the test output.

The same harness runs with the backend tests in the ordinary pull-request CI
workflow.

## Exercise restart and production-container resilience

Podman-backed resilience tests run the same same-origin HTTP lifecycle twice:
once with the CoreEx project and once with the production `backend/Dockerfile`.
They restart CoreEx, restart Vite/workerd so its persisted local D1 identity
store is closed and reopened, and restart PostgreSQL; preserve a queued
browser-cache edit across a simulated browser restart; verify
live, startup, and readiness transitions; and prove idempotent recovery of the
accepted state.

```bash
npm run test:resilience
```

The production-shaped run inspects the live image and process rather than only
the Dockerfile. It verifies Linux AMD64, the non-root UID, framework-dependent
`dotnet` entry point, port 8080, the 1 GiB limit, explicit Aspire OTLP settings,
and the absence of container mounts for durable state. PostgreSQL owns practice
state and D1 owns identity state; neither depends on the CoreEx filesystem.

CoreEx deliberately registers an ephemeral data-protection provider because it
owns no cookie or protected browser-session boundary. A framework component may
still create an unused disposable key file and emit the standard container
warning, but the directory is not mounted and no application state depends on
it. Better Auth sessions and JWKS remain in D1 across the workerd restart.

These cases stay operator-invoked. `npm run test:resilience` is the only command
that runs them: CI does not, and neither do `npm run test:backend` or
`npm run test:full`. On failure they write the PostgreSQL, migration, CoreEx, and
Worker resource logs to the test output. The local Container configuration
explicitly enables and wires Aspire OTLP; the production image and Cloudflare
container environment keep `OTEL_SDK_DISABLED=true`, so they never retry a
local collector accidentally.

## Verify a production build

```bash
npm run test
npm run test:worker
npm run test:backend
npm run test:full
npm run test:deployment
npm run test:resilience
npm run lint
npm run build
npm run preview
```

## Copilot plan-approval workflow

The manually dispatched **Copilot plan, approve, then implement** workflow asks
the Copilot cloud agent to delegate planning to the repository's
`context7-plan-review` custom agent. The first agent session uses the selected
model and opens a draft pull request containing only `PLAN.md`. After a required
reviewer approves the `plan-approval` environment, the workflow comments on that
exact pull request to have Copilot implement the approved plan, remove `PLAN.md`,
run the unit tests, lint, and production build, and mark the pull request ready
for normal review. It never runs the Playwright QA suite.

The public workflow remains `.github/workflows/copilot-plan-then-implement.yml`.
It delegates the planning and implementation phases to reusable workflows, with
their API operations and validation rules kept in focused scripts under
`.github/scripts/copilot-plan-then-implement/`.

The workflow starts the agent through the public-preview Agent Tasks REST API,
captures the returned task ID, and polls that exact task to completion with
bounded retries for transient status failures. It reuses the completed response
and resolves the pull artifact's global node ID to the exact repository pull
request. This allows the repository-scoped fine-grained PAT to be used without
the OAuth-only authentication required by the `gh agent-task` command.

Configure these repository settings before dispatching the workflow:

- Create an Actions repository secret named `COPILOT_AGENT_PAT`. Its
  fine-grained personal access token needs **Agent tasks: read and write**,
  **Contents: read**, **Issues: read and write**, and **Pull requests: read and
  write** access to this repository.
- Create a separate Agents repository secret named `COPILOT_MCP_CONTEXT7` under
  **Settings > Secrets and variables > Agents**. Actions secrets are not passed
  to Copilot cloud agent MCP servers, so the Context7 key must use the Agents
  secret store.
- Create the `plan-approval` environment with at least one required reviewer.
  Enabling prevention of self-review is recommended.

In **Actions**, select **Copilot plan, approve, then implement**, choose **Run
workflow**, enter the task, select a model, and optionally enter a base branch.
A blank base branch uses the repository default. The equivalent CLI dispatch is:

```bash
gh workflow run copilot-plan-then-implement.yml \
  -f task="Describe the scoped change" \
  -f model="auto" \
  -f base_branch="main"
```

Supported model values are `auto`, `gpt-5.4`, `gpt-5.3-codex`,
`gpt-5.2-codex`, `claude-opus-4.6`, `claude-sonnet-4.6`,
`claude-opus-4.5`, and `claude-sonnet-4.5`. `auto` is the default and omits the
`model` property from the Agent Tasks request so GitHub can select the model.
Every explicit choice is sent as the API model ID. These public-preview values
come from the [Agent Tasks API documentation](https://docs.github.com/en/rest/agent-tasks/agent-tasks?apiVersion=2026-03-10)
and may change.

The selected model starts the planning task. The workflow does not start a
separate implementation task: it continues work by mentioning `@copilot` on the
same pull request. GitHub [uses the original pull request model by default for
follow-up sessions](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/use-cloud-agent-on-github#continuing-work-on-a-pull-request),
so the model also remains the default for implementation.

Review `PLAN.md` at the pull request URL shown on the waiting environment job.
Approve that deployment only when the plan is acceptable. Approval authorizes
implementation but not merge; the resulting code still goes through normal
pull request review.

The workflow stops before implementation if credentials or Context7 are not
configured, the Agent Tasks API denies access or times out, the base already
has a root `PLAN.md`, the planning session fails, the returned task does not
contain exactly one resolvable pull request artifact, the plan PR changes any
other file, or the PR node identity, draft state, branches, or approved head
SHA changes. An explicit model can also be rejected when it is unavailable to
the token owner's Copilot plan or blocked by organization policy; choose an
allowed model or `auto`, then dispatch a new run. Fix other configuration
failures and dispatch a new run. If approval is rejected, no implementation
request is sent; rerun the failed jobs to request approval again. If the plan PR
or its head SHA needs to change, close the partial PR and dispatch a new workflow
run instead of reusing the pinned approval.

## Deploy production

Use the [account-system operator guide](docs/account-system-operations.md) for
initial provisioning, local and production secrets, recovery, troubleshooting,
and cost controls. Cloudflare and Neon alerts are informational: **they do not
cap spend or stop services**. The secret-free evidence for the accepted stack is
recorded in [account-system acceptance](docs/account-system-acceptance.md).

[`scripts/production/production-target.json`](scripts/production/production-target.json)
is the single source of truth for the production target. It pins the release
branch, Cloudflare resources, rollback-prime source and active version, health
gate, migration manifest, and exact Node, .NET SDK, and Wrangler versions. The
production commands refuse another target. Match `.nvmrc` and `global.json`, and
run a Docker-compatible container engine or set `WRANGLER_DOCKER_BIN` to Podman.

### One-time initialization

The legacy static Worker predates its Durable Object class. Cloudflare cannot
roll back across a Durable Object lifecycle migration, so establish a compatible
static rollback version **before installing the first Worker secrets**:

```bash
npx wrangler login
npm ci
npm run production:prime -- --dry-run
npm run production:prime
npm run production:bootstrap
```

`production:prime` builds the pinned legacy commit, keeps its static asset
behavior, adds only the dormant `CoreExContainer` Durable Object class, and
creates no Container application or database binding. It accepts only the
pinned legacy Worker version and is safely repeatable; later secret-created
versions retain that class. Its dry run does not mutate Cloudflare.

The bootstrap helper then prompts only for missing `GITHUB_CLIENT_ID`,
`GITHUB_CLIENT_SECRET`, `BETTER_AUTH_SECRET`, and pooled
`POSTGRES_CONNECTION_STRING` values. It validates all new values before the
first write and passes them through standard input without storing or logging
them. Secret rotation remains a separate maintenance operation because each
`wrangler secret put` creates a Worker version.

### Release

Deploy an accepted `main` release only from a clean checkout whose `HEAD`
exactly matches `origin/main`:

```bash
npm ci
npm run build
npm run production:deploy -- --dry-run
npm run production:deploy
```

Both deployment commands rebuild and validate the browser assets with account
mode enabled before reporting or rolling out the release; they never reuse a
possibly guest-only `dist/` build. They then prompt for the **direct** Neon
migration connection. It must use ADO.NET syntax with `SSL Mode=VerifyFull`,
`Channel Binding=Require`, and `GSS Encryption Mode=Disable`. The deployment
parent passes its terminal directly to the migration child, so the credential
never enters an argument, file, log, or unrelated child process.

The dry run verifies the pinned tools and identities, secret names, active
Worker and CoreEx image, incoming production build, bindings, and native
PostgreSQL/D1 ledgers. It reports the commit-addressed image tag, pending
migrations, expected heads, and immediate singleton rollout without changing a
database, image registry, Worker, or Container application.

The real command repeats that preflight, applies hash-bound `expand` migrations
PostgreSQL-first and D1-second, and verifies both native ledgers. It builds the
CoreEx image as `coreex:<commit>`, pushes it, resolves and pins its immutable
registry digest in a temporary configuration, rechecks the active Worker, then
runs a strict `wrangler deploy` tagged with the commit and using an immediate
Container rollout. Because Cloudflare's Container list can lag a completed
rollout, verification polls the named application's authoritative `containers
info` response for the immutable digest before it succeeds or begins recovery.
`npm run production:prepare` remains available when an
operator deliberately needs only the resumable database-preparation phase.

If application deployment fails after changing the Worker or Container, the
command restores the captured Worker version and retained image—or removes a
partially created first Container—and verifies both. It never reverses either
database. A completed rollout is not automatically rolled back: the command
checks `/` and the anonymous `GET /api/practice-state` response every five
seconds for one minute, requiring HTML and CoreEx `401` liveness. A failed gate
leaves the release active, emits a non-zero result, and records the observations
for repair-forward work.

Production `/health*` remains private, so deployment never wakes or polls
`/health/ready`; the report states that database readiness was intentionally not
probed. Completed releases, application-recovery paths, and preparation aborts
emit a secret-free operator record with the applicable release, timestamps,
migration heads, Worker versions, image digests, and health findings.

`scripts/production/migrations.json` remains the compatibility manifest. A
missing, changed, contracting, reordered, unknown, or database-only migration
stops before application rollout. Successfully applied additive migrations stay
in place, and rerunning resumes from the native ledgers.

Run the disposable simulations with:

```bash
npm run test:deployment
```

They use Podman-backed PostgreSQL and local D1 stores and combine with the CLI
rollout simulations to cover fresh, current, pending, incompatible, unknown,
failed, interrupted, concurrent-change, dry-run, successful rollout, partial
Worker/CoreEx failure, recovery, and failed-health states. They never contact
production and run in ordinary CI; restart resilience remains separately
operator-invoked.

## Content model

The question bank is in [`src/data/questions.json`](src/data/questions.json). Each entry contains:

- a stable ID and GH-600 domain
- objective, difficulty, and question type
- answer options and one or more correct answer IDs
- an original explanation
- a link to the relevant official source

Domain display metadata and published weights are in [`src/data/domains.ts`](src/data/domains.ts).

## Practice state

Guest practice state is stored locally under the
`agentic-ready-gh600-v2:guest` key as a schema-v2 practice state envelope. It
contains the active attempt, 30 most recent finished attempts, bookmarks, and
latest answers; guest state does not fabricate server receipts or make network
requests for persistence. Existing `agentic-ready-gh600-v1` data is migrated
automatically, and the legacy value is removed only after its v2 replacement is
written successfully. Clearing site data removes the practice state.

Authenticated practice state uses the same envelope shape through the
handwritten browser adapter, the Worker, CoreEx, and PostgreSQL. The API accepts
only the closed question/option and scoring manifest in
[`contracts/question-recognition-manifest.json`](contracts/question-recognition-manifest.json),
uses its answer keys only when a merge preserves an abandoned active attempt,
returns server receipts, and isolates every row by the identity token subject.

## Disclaimer

This is an original, unofficial study aid. It does not contain Microsoft exam questions and is not affiliated with or endorsed by Microsoft or GitHub.
