# PLAN

Planning subagent: context7-plan-review

## Task
Add hover behavior so the question text is displayed when hovering over a question item in the Question map.

## Relevant files/components
- `/home/runner/work/acn-fde/acn-fde/src/App.tsx`
  - `ExamRunner` component, Question map grid in the `Question map` aside section.
  - Map item buttons that currently show question numbers only.
- Optional validation files:
  - `/home/runner/work/acn-fde/acn-fde/src/qa-tests/home.spec.ts` (or new QA spec)
  - `/home/runner/work/acn-fde/acn-fde/src/App.test.tsx` (optional attribute assertions)

## Dependency versions (from lockfile)
- `react`: `19.2.7`
- `react-dom`: `19.2.7`
- `vitest`: `4.1.10`
- `playwright`: `1.61.1`

## Context7 evidence (version-matched)
- Library: React
- Resolved Context7 ID: `/react/react`
- Queried docs: `/react/react/v19.2.7`
- Evidence used:
  - React DOM default prop handling forwards unlisted props like `title` to DOM attributes.
  - `setValueForAttribute` writes attributes via `node.setAttribute(...)`.
  - `aria-*` attributes (including `aria-label`) are recognized/validated.
- Planning implication:
  - Adding `title` and `aria-label` on question-map `<button>` elements is supported for installed React version.

## Ordered implementation steps
1. Locate question-map item rendering in `ExamRunner` (`attempt.questionIds.map(...)`).
2. Resolve question prompt for each item (`const prompt = questionMap.get(id)?.prompt`).
3. Add hover text on each map button (`title={prompt ?? `Question ${index + 1}`}`).
4. Add accessible labeling (`aria-label={prompt ? `Question ${index + 1}: ${prompt}` : `Question ${index + 1}`}`).
5. Keep click navigation behavior unchanged (`setIndex(index); setMapOpen(false)`).
6. Ensure safe fallback text when prompt lookup is missing.

## Validation
- Manual:
  1. Start a practice set.
  2. Open Question map.
  3. Hover map items and verify native tooltip shows question text.
  4. Verify clicking still navigates to correct question.
- Automated (recommended):
  - Add Playwright assertion that question-map buttons expose non-empty `title` and `aria-label` after entering exam mode.
- Standard checks:
  - `npm run test`
  - `npm run lint`
  - `npm run test:qa` (if QA spec updated)

## Risks and edge cases
- Long prompts may create long native tooltips.
- Touch devices do not reliably support hover tooltips.
- Hover-only feedback is limited for keyboard users; `aria-label` helps accessibility.
- Missing `questionMap` lookup should use fallback labels.
