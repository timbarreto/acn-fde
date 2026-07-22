Planning subagent: context7-plan-review

# Plan: add question text tooltip to the question map

## Summary

Add a native hover tooltip to each question-map cell in `ExamRunner` by using the question's `prompt` text on the existing map `<button>` elements, without introducing a new tooltip dependency. The most direct approach is to set `title={question.prompt}` on each map button and keep current click/navigation behavior unchanged.

## Relevant files

- `src/App.tsx:498-683` — `ExamRunner` contains the question map UI.
- `src/App.tsx:659-673` — the map buttons that currently render only the question number.
- `src/types.ts:10-20` — confirms each `Question` has a `prompt` field for tooltip text.
- `src/components/ui/` — reusable UI primitives; no existing tooltip UI wrapper was identified.
- `package.json` and `package-lock.json` — dependency inventory and installed versions.

## Dependency versions

- `react`: `19.2.7`
- `react-dom`: `19.2.7`
- `lucide-react`: `0.468.0`
- No installed `@radix-ui/react-tooltip` or local `src/components/ui/tooltip.tsx` was found during inspection.

## Context7 evidence

- Context7 source: `fixtures/attribute-behavior/AttributeTableSnapshot.md`
  - Fact: React `19.2.7` renders the `title` attribute on built-in DOM elements and string values are serialized to the DOM.
  - Implication: adding `title={...}` to the existing map `<button>` will produce the browser's native hover tooltip.

- Context7 source: `packages/react-dom-bindings/src/shared/ReactDOMUnknownPropertyHook.js`
  - Fact: React reserves bare `aria` and expects individual `aria-*` attributes instead.
  - Implication: if an accessibility label is added, it should be `aria-label`, not `aria`.

- Gap:
  - Context7 did not return an official React accessibility statement saying `title` alone is sufficient for accessible naming, so that claim should not be treated as verified.

## Ordered implementation steps

1. In `src/App.tsx`, update the question-map loop in `ExamRunner` (`attempt.questionIds.map(...)`) to look up the full `Question` for each `id` from `questionMap`.
2. Add a native tooltip to each map button with the question text, for example `title={mapQuestion.prompt}`.
3. Optionally add `aria-label={\`Question ${index + 1}: ${mapQuestion.prompt}\`}` to the same button if the implementation should expose the full text beyond the visible numeric label.
4. Keep the existing button click handler, current/answered styling, and flag indicator unchanged so the change stays scoped to hover text only.
5. If the prompt text is too long in practice, trim only the tooltip string presentation logic, not the underlying question data.

## Validation

- Manual:
  - Start an exam, open the question map, hover a numbered map button on desktop, and confirm the browser shows the matching question text.
  - Click a map button and confirm navigation still works and the map still closes on mobile.
  - Confirm flagged/current/answered styling is unchanged.

- Project checks:
  - `npm run test`
  - `npm run lint`
  - `npm run build`

## Risks

- Native `title` tooltips are browser-controlled and visually inconsistent across platforms.
- Hover tooltips do not help touch devices; mobile behavior will remain unchanged unless a custom tooltip/popover is later introduced.
- Very long question prompts may create large tooltips; this is a UX risk, not a functional blocker.
