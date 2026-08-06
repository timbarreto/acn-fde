# Account-system acceptance record

This record is intentionally secret-free and contains no personal identity,
OAuth authorization code, state value, session cookie, token, database password,
or practice state. It records the interfaces exercised and the release
identities needed to audit the result.

## Scope and status

Acceptance covers permanent guest practice, optional account practice, local
and production-shaped stacks, real GitHub OAuth, destructive data controls,
production migration/deployment, and application recovery. The Playwright QA
suite is outside this acceptance and was not run.

Status on 2026-08-06: **automated, Container, production deployment, and real
local/production OAuth sign-in accepted; safe sign-out, real account deletion,
and the final post-deletion sign-in are pending operator confirmation.** Do not
mark issue #81 complete until the pending rows below are resolved.

## Automated verification

Run from a clean checkout based on production release
`51f1e39618238ec93a83768e7d76fab42ce8202c` on 2026-08-06:

| Interface | Result | Accepted behavior |
|---|---:|---|
| `npm run test` | 269 passed | Guest continuity, migration, subject-isolated caches, first sync, concurrent/offline edits, send-and-rebase, recovery, safe sign-out, reset/deletion state machines, UI, and account identity |
| `npm run test:worker` | 14 passed | Worker routing, D1 schema drift, Better Auth callback, private-email fallback, profile refresh, secure cookies, JWT/JWKS, and production exclusion of test auth |
| `npm run test:backend` | 51 passed | CoreEx API/service/repository behavior, validation, merge rules, authorization, health, plus the isolated full-stack tests |
| `npm run test:full` | 4 passed | AppHost configuration and same-origin two-subject save/load/reset/delete flow through real local D1 and PostgreSQL |
| `npm run test:deployment` | 14 passed | Disposable PostgreSQL/D1 ledgers; dry run; resumability; concurrent-change gates; partial application recovery; failed-health reporting |
| `npm run test:resilience` | 2 passed in 5m44s | Project and production-container restarts, queued browser edit recovery, PostgreSQL and D1 durability, health transitions, image/runtime constraints, and no durable Container mounts |
| `npm run lint` | 0 errors | Two pre-existing React Fast Refresh warnings remain in `src/App.tsx` |
| `npm run build` | passed | TypeScript project build and production Vite assets |

The AppHost Development configuration now also has a focused configuration test
that proves only the three named local auth parameters are attached to the Vite
Worker host; it does not enable wholesale process-environment injection.

## Local and production-container acceptance

The isolated full-stack suite accepted:

- SPA and local live/startup/readiness routes;
- anonymous practice-state rejection;
- two independent subjects with no cross-subject read, write, reset, or delete;
- save/load round trips through the handwritten browser contract, Worker,
  CoreEx, and PostgreSQL;
- practice-state deletion while identity remains; and
- practice-state deletion before Better Auth identity deletion.

The separately invoked resilience suite accepted the same same-origin lifecycle
against both the CoreEx project and `backend/Dockerfile`. It restarted CoreEx,
Vite/workerd with persisted local D1, and PostgreSQL; retained a queued offline
edit; and recovered accepted state. The production image was observed as Linux
AMD64, UID 1654, framework-dependent `dotnet`, port 8080, 1 GiB, no durable
mounts, and explicit local-only OTLP wiring.

The frontend persistence suites provide the browser-level acceptance for guest
continuity, interrupted first-sync write ordering, concurrent devices,
offline/retryable edits, canonical send-and-rebase, safe sign-out blocking,
exact-key cache erasure, reset, and resumable ordered deletion. These cases do
not depend on a live GitHub account.

The Development configuration was then accepted manually with the separate
localhost GitHub OAuth app. The first attempt exposed two configuration gaps:
an orphaned standalone Vite process held port 5173, and CoreEx was validating
local tokens against its production defaults because Aspire starts the project
without its launch profile. After removing the stale process and explicitly
wiring the local issuer/JWKS/audience contract, the real callback returned to
Account, showed the GitHub avatar and username, reached `Synced`, survived a
browser refresh, created one local provider account with no persisted provider
credentials, and wrote one subject-owned PostgreSQL practice-state row. The
stack was then stopped cleanly; retained Development stores are intentional.

## Real GitHub OAuth acceptance

Production uses a real GitHub OAuth app and the production callback origin.
Acceptance to date:

| Flow | Result | Evidence |
|---|---|---|
| Sign-in and callback | accepted | Browser completed GitHub authorization; Better Auth created one opaque identity, linked provider account, and session |
| Private public email | accepted | The accepted GitHub account exposes no public email; callback obtained the primary verified email through GitHub's email response |
| Provider credential removal | accepted | Aggregate D1 inspection found no persisted access, refresh, or ID token |
| Profile refresh | accepted | A later real callback populated/refreshed the GitHub username and avatar shown by Account |
| Safe sign-out | pending confirmation | Operator must confirm the Account action ends the session only after pending state is accepted and starts an empty guest state |
| Account deletion | pending confirmation | Operator must export if desired, confirm deletion in Account, then verify practice state is removed before identity and a new guest state begins |
| Sign-in after deletion | pending confirmation | A final GitHub sign-in must create a fresh opaque identity and complete first sync without exposing the deleted account cache |

No OAuth code, state, cookie, provider token, email, username, avatar URL, or
subject is retained in this document.

## Production deployment acceptance

The accepted release was deployed from clean `main` after a non-mutating dry
run:

| Item | Accepted value/finding |
|---|---|
| Release | `51f1e39618238ec93a83768e7d76fab42ce8202c` |
| Worker version | `69c296d8-4b60-4537-9c34-285463ee315b` at 100% |
| CoreEx image | immutable digest `sha256:cd8829594bec3811a8eccccee208ae8596569318626a9b73decc6a62745afa35` |
| PostgreSQL ledger head | `Acn.Fde.Practice.Database.Migrations.20260804-000002-create-practice-state.pgsql` |
| D1 ledger head | `0002_github_profile.sql`; remote migration check reported none pending |
| Assets | account-enabled Worker `ASSETS` bundle containing the GitHub identity UI |
| One-minute gate | 13/13 SPA `200` and 13/13 anonymous CoreEx `401`; CoreEx answered from observation 1 |
| Readiness | intentionally not probed because production `/health*` is private |
| CI | PR #106 passed before this acceptance record |

Rollback behavior has both simulation and production evidence. Disposable CLI
scenarios accepted restoration after partial Worker/Container failure, removal
of a partial first Container, forward-only database handling, and no automatic
rollback after completed-but-unhealthy deployment. During the initial real
production rollout, the partially created first Container was removed and the
primed Worker restored; later repair-forward releases also exposed and fixed
stale `containers list` reporting. Current tooling treats `containers info` as
authoritative and polls the immutable digest before declaring rollout or
recovery complete.

## Final manual checklist

Before closing #81:

- [x] Run the local Development stack once with local GitHub user-secrets and
      confirm callback, Account identity, first sync, and reload continuity
      (accepted 2026-08-06).
- [ ] In production, make an edit, wait for `Synced`, sign out, and confirm the
      new guest state contains no account practice state.
- [ ] Sign in, optionally export, delete the app account, and confirm Account
      returns to an empty guest state; the GitHub account itself must remain
      unchanged.
- [ ] Sign in once more and confirm a fresh account first sync succeeds.
- [ ] Replace the pending OAuth rows above with dated accepted results.
