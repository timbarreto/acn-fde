# Agentic Ready — GH-600 Practice

An unofficial, offline-first practice exam for the **GitHub Certified: Agentic AI Developer (GH-600)** credential.

## What is included

- A 100-question local bank covering all six published GH-600 domains
- Full, quick, and focused-domain practice modes, with multi-domain selection for drills and quick checks
- Question queues that put never-answered questions first, then least-recently-answered, across all modes
- Timed attempts with question navigation and flags
- Single-answer and multiple-answer scenarios
- Per-domain scoring, answer explanations, and source links
- Instant feedback that reveals the correct answer and explanation as you check each question
- Saved attempts, bookmarks, incorrect-answer review, and resume support
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
