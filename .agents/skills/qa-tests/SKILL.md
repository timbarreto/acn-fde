---
name: qa-tests
description: Set up, run, and debug the repository's Playwright QA tests
---

QA tests are Playwright specs in `src/qa-tests`. Run all commands from the repository root.

## First-time setup

1. Install project dependencies:
   ```bash
   npm install
   ```
2. Install the Chromium browser used by the configured Playwright project:
   ```bash
   npx playwright install chromium
   ```

## Run the tests

Run the full QA suite:

```bash
npm run test:qa
```

`playwright.config.ts` automatically starts Vite at `http://127.0.0.1:5173`, so do not start the site separately. When running locally, Playwright reuses an existing server on that address.

Run one spec or a test matching a title:

```bash
npm run test:qa -- src/qa-tests/home.spec.ts
npm run test:qa -- --grep "renders the home page"
```

## Debug failures

Run Playwright in headed or interactive UI mode:

```bash
npm run test:qa -- --headed
npm run test:qa -- --ui
```

Open the HTML report after a run:

```bash
npx playwright show-report
```

Failure artifacts are written to `test-results`; traces are retained on the first retry in CI. Fix the underlying application or test issue, then rerun the smallest affected spec before running the full QA suite.