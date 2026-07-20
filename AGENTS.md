# AGENTS.md

## Project overview

This repository contains **Agentic Ready — GH-600 Practice**, an unofficial,
offline-first practice exam for the GitHub Certified: Agentic AI Developer
(GH-600) credential. It is a client-only React application: there is no
backend, account system, API, or database.

## Technology

- React 19 and TypeScript
- Vite
- Tailwind CSS with shadcn/ui-style Radix components
- Lucide icons
- Browser `localStorage` for persistence
- npm, with `package-lock.json` committed

## Repository map

- `src/main.tsx`: React entry point.
- `src/App.tsx`: primary application component and view/state orchestration.
- `src/types.ts`: shared question, exam, and persistence types.
- `src/lib/exam.ts`: question selection, scoring, and exam utilities.
- `src/lib/utils.ts`: shared UI utilities, including `cn`.
- `src/data/questions.json`: question bank.
- `src/data/domains.ts`: domain labels, weights, colors, and icons.
- `src/components/ui/`: reusable UI primitives.
- `src/index.css`: global styles and Tailwind layers.
- `public/`: static assets (favicon, Open Graph cover, touch icon).
- `FDE/` and `GH-600/`: source material and study documentation.

## Development commands

Run commands from the repository root.

```bash
npm install       # Install dependencies
npm run dev       # Start the Vite development server
npm run test      # Run Vitest unit tests
npm run lint      # Run ESLint
npm run build     # Type-check and create a production build
npm run preview   # Serve the production build locally
```

Unit tests use Vitest and live next to the code they cover (for example,
`src/lib/exam.test.ts`). The Playwright QA suite in `src/qa-tests` runs with
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

Persisted progress uses the `agentic-ready-gh600-v1` localStorage key. Treat
changes to `PersistedState` as data migrations: maintain compatibility with
previously saved browser data or deliberately version the key. The application
retains the 30 most recent completed attempts.

## Change guidelines

- Make focused changes and do not modify generated output such as `dist/`.
- Do not add network or backend requirements without an explicit product
  decision; the application is designed to work locally.
- Never commit credentials, tokens, personal data, or proprietary exam
  questions.
- Update `README.md` when setup commands, user-visible capabilities, or the
  content model change.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
