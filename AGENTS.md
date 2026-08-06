# AGENTS.md

## Project overview

This repository contains **Agentic Ready — GH-600 Practice**, an unofficial,
offline-first practice exam for the GitHub Certified: Agentic AI Developer
(GH-600) credential. Standalone guest practice is a client-only React
application. The optional full-stack development path adds a same-origin
Cloudflare Worker, a trimmed CoreEx service, local PostgreSQL, and authenticated
schema-v2 practice-state load/merge/delete APIs plus first-sign-in sync into a
subject-isolated browser cache with durable send-and-rebase synchronization,
safe authentication recovery, passive sync status, and optional account UI
with export, reset, and ordered account deletion controls.

## Vocabulary

[`CONTEXT.md`](CONTEXT.md) is the project glossary and is authoritative for
new work. Read it before naming anything: several everyday words here are
deliberately narrowed (*user* never means a guest, *progress* never means
stored answers, *snapshot* never means anything on the wire), and some agreed
terms do not yet appear in `src/`.

## Technology

- React 19 and TypeScript
- Vite
- Tailwind CSS with shadcn/ui-style Radix components
- Lucide icons
- Browser `localStorage` for persistence
- Cloudflare Workers runtime through the Vite plugin
- .NET 10, CoreEx, Aspire, and PostgreSQL 18 for full-stack development
- npm, with `package-lock.json` committed

## Repository map

- `src/main.tsx`: React entry point.
- `src/App.tsx`: primary application component and view/state orchestration.
- `src/types.ts`: shared question, exam, and persistence types.
- `src/lib/exam.ts`: question selection, scoring, and exam utilities.
- `src/lib/persistence.ts`: framework-independent practice-state storage,
  synchronization, destructive data controls, and legacy migration.
- `src/lib/data-controls.ts`: client-side practice-state export creation and
  download.
- `src/lib/use-practice-state.ts`: thin React integration for the persistence
  store.
- `src/lib/utils.ts`: shared UI utilities, including `cn`.
- `src/data/questions.json`: question bank.
- `src/data/domains.ts`: domain labels, weights, colors, and icons.
- `src/components/ui/`: reusable UI primitives.
- `src/index.css`: global styles and Tailwind layers.
- `public/`: static assets (favicon, Open Graph cover, touch icon).
- `worker/`: same-origin routing between application assets and CoreEx, plus the
  production CoreEx Container class.
- `backend/`: CoreEx API, production Dockerfile, migrations, tests, and Aspire AppHost.
- `contracts/`: append-only recognition data shared across browser and backend contracts.
- `GH-600/`: source material and study documentation.

## Development commands

Run commands from the repository root.

```bash
npm install       # Install dependencies
npm run dev       # Start the Vite development server
npm run dev:full  # Start PostgreSQL, migrations, CoreEx, and the Worker app
npm run test      # Run Vitest unit tests
npm run test:worker # Run Worker integration tests
npm run test:backend # Run .NET tests
npm run test:full # Exercise the isolated signed-in stack end to end
npm run test:resilience # Restart project/container stacks and inspect the production image (operator-invoked)
npm run lint      # Run ESLint
npm run build     # Type-check and create a production build
npm run preview   # Serve the production build locally
```

Unit tests use Vitest and live next to the code they cover (for example,
`src/lib/exam.test.ts`). Resilience tests require Podman, write Aspire resource
logs to the test output on failure, and run only through
`npm run test:resilience`; CI and the other test commands exclude them. The
Playwright QA suite in `src/qa-tests` runs with
`npm run test:qa`; do not run the QA suite unless the operator explicitly
asks. For code changes, run `npm run test`, `npm run lint`, and
`npm run build`. Manually exercise the affected flow when the change involves
user interaction or persisted state.

## Implementation conventions

- Keep TypeScript strict and avoid `any`; define shared domain types in
  `src/types.ts`.
- Use functional React components and hooks.
- Prefer the `@/` path alias for imports from `src`.
- Use `import type` for type-only imports.
- Follow the existing formatting: double quotes, no semicolons, and trailing
  commas where supported.
- Use Tailwind utility classes for styling. Use `cn` from `@/lib/utils` when
  classes are conditional or need merging.
- Reuse components in `src/components/ui/` before introducing new primitives.
- Preserve accessibility semantics, keyboard behavior, visible focus states,
  and responsive layouts when changing UI.
- Keep exam calculations and selection logic in `src/lib/exam.ts` rather than
  duplicating it in components.
- Avoid adding dependencies unless the existing stack cannot meet the need.

## Content and persistence

Questions in `src/data/questions.json` must conform to the `Question` interface
in `src/types.ts`. Keep question IDs stable and unique. Option IDs referenced by
`correctAnswers` must exist on that question, and `single` questions must have
one correct answer. Use original wording and link sources to authoritative
documentation.

Domain IDs are the closed set defined by `DomainId`; update the type, metadata,
selection logic, and related content together if that set changes.

Guest practice state uses the `agentic-ready-gh600-v2:guest` localStorage key
and a schema-v2 practice state envelope. The persistence store migrates the
legacy `agentic-ready-gh600-v1` shape and removes it only after a successful v2
write. Treat envelope changes as data migrations and keep browser storage
behind `src/lib/persistence.ts`. The application retains the 30 most recent
finished attempts.

## Change guidelines

- Make focused changes and do not modify generated output such as `dist/`.
- Do not add network or backend requirements without an explicit product
  decision; the application is designed to work locally.
- Never commit credentials, tokens, personal data, or proprietary exam
  questions.
- Update `README.md` when setup commands, user-visible capabilities, or the
  content model change.

## Agent skills

### Issue tracker

Track requests and PRDs in GitHub Issues for `timbarreto/acn-fde`. See
`docs/agents/issue-tracker.md`.

### Triage labels

Use the five canonical Matt Pocock triage labels. See
`docs/agents/triage-labels.md`.

### Domain docs

Use the single-context domain documentation layout. See
`docs/agents/domain.md`.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
