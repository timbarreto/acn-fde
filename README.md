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
- Saved attempts, bookmarks, incorrect-answer review, and resume support with automatic timer pausing on exit
- A focused study sequence mapped to the published exam domains
- Refresh-stable, deep-linkable pages with browser Back and Forward navigation
- No account, API, database, or backend

## Stack

- React 19 + TypeScript
- Vite
- Tailwind CSS
- shadcn/ui components built on Radix primitives
- Lucide icons
- Browser `localStorage`

## Run locally

```bash
npm install
npm run dev
```

Open the URL printed by Vite (normally `http://localhost:5173`).

## Verify a production build

```bash
npm run test
npm run lint
npm run build
npm run preview
```

## Copilot plan-approval workflow

The manually dispatched **Copilot plan, approve, then implement** workflow asks
the default Copilot cloud agent to delegate planning to the repository's
`context7-plan-review` custom agent. The first agent session opens a draft pull
request containing only `PLAN.md`. After a required reviewer approves the
`plan-approval` environment, the workflow comments on that exact pull request
to have the same Copilot agent implement the approved plan, remove `PLAN.md`,
run the unit tests, lint, and production build, and mark the pull request ready
for normal review. It never runs the Playwright QA suite.

The workflow starts the agent through the public-preview Agent Tasks REST API,
captures the returned task ID, and polls that exact task to completion. This
allows the repository-scoped fine-grained PAT to be used without the OAuth-only
authentication required by the `gh agent-task` command.

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
workflow**, enter the task, and optionally enter a base branch. A blank base
branch uses the repository default. The equivalent CLI dispatch is:

```bash
gh workflow run copilot-plan-then-implement.yml \
  -f task="Describe the scoped change" \
  -f base_branch="main"
```

Review `PLAN.md` at the pull request URL shown on the waiting environment job.
Approve that deployment only when the plan is acceptable. Approval authorizes
implementation but not merge; the resulting code still goes through normal
pull request review.

The workflow stops before implementation if credentials or Context7 are not
configured, the Agent Tasks API denies access or times out, the base already
has a root `PLAN.md`, the planning session fails, the returned task does not
contain exactly one pull request artifact, the plan PR changes any other file,
or the PR identity, draft state, branches, or approved head SHA changes. Fix
configuration failures and dispatch a new run. If approval is rejected, no
implementation request is sent; rerun the failed jobs to request approval
again. If the plan PR or its head SHA needs to change, close the partial PR and
dispatch a new workflow run instead of reusing the pinned approval.

## Deploy to Cloudflare

The production build can be deployed as a Cloudflare Workers Static Assets
application. Authenticate Wrangler once, then build and deploy:

```bash
npx wrangler login
npm run deploy
```

Wrangler prints the deployed `workers.dev` URL when the upload completes. The
deployment uses `wrangler.jsonc` to serve the Vite output in `dist/` and return
the SPA shell for application routes.

To use a custom domain, deploy the Worker first, then add the hostname under
**Workers & Pages > agentic-ready-gh-600 > Settings > Domains & Routes** in the
Cloudflare dashboard. The domain must belong to an active Cloudflare zone.

## Content model

The question bank is in [`src/data/questions.json`](src/data/questions.json). Each entry contains:

- a stable ID and GH-600 domain
- objective, difficulty, and question type
- answer options and one or more correct answer IDs
- an original explanation
- a link to the relevant official source

Domain display metadata and published weights are in [`src/data/domains.ts`](src/data/domains.ts).

## Saved data

Attempts and bookmarks are stored under the `agentic-ready-gh600-v1` localStorage key. The app retains the 30 most recent completed attempts. Clearing site data resets progress.

## Disclaimer

This is an original, unofficial study aid. It does not contain Microsoft exam questions and is not affiliated with or endorsed by Microsoft or GitHub.
