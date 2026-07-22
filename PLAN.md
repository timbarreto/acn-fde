Planning subagent: context7-plan-review

# Plan: Show question text tooltip in the question map

## Dependency versions

- React: `^19.1.1` in `package.json`, resolved to `19.2.7` in `package-lock.json`
- react-dom: `^19.1.1` in `package.json`, resolved to `19.2.7` in `package-lock.json`
- Relevant Context7 check: React `19.2.7`

## Repository findings

- `/home/runner/work/acn-fde/acn-fde/src/App.tsx:498-687` contains `ExamRunner`, including the question map sidebar.
- `/home/runner/work/acn-fde/acn-fde/src/App.tsx:665-675` renders each question-map item as a numbered `<button>` only.
- `/home/runner/work/acn-fde/acn-fde/src/types.ts:10-20` shows each `Question` has a `prompt` field that should be surfaced in the hover tooltip.
- `/home/runner/work/acn-fde/acn-fde/src/components/ui/` currently has no tooltip component to reuse.

## Context7 evidence

- Library/version checked: React `19.2.7`.
- Context7 documentation indicates React DOM forwards standard intrinsic element attributes to the real DOM and writes them as DOM attributes.
- Implication: adding `title` to the existing `<button>` will produce a real browser-native hover tooltip.
- Context7 documentation also indicates `aria-label` is a supported valid ARIA attribute in React `19.2.7`.
- Implication: adding `aria-label` alongside `title` is supported and improves accessibility.

## Ordered implementation steps

1. Update the question-map render loop in `/home/runner/work/acn-fde/acn-fde/src/App.tsx` where `attempt.questionIds.map(...)` renders the numbered buttons.
2. Inside that loop, look up the full question for each question ID from the existing `questionMap`.
3. Add a native hover tooltip to the existing map button with `title={mapQuestion?.prompt}`.
4. Add an accessible label such as `aria-label={`Question ${index + 1}: ${mapQuestion?.prompt}`}` so the control does not expose only the number to assistive technology.
5. Keep existing click behavior unchanged so question navigation and mobile drawer closing still work.
6. Optionally include current/answered/flagged state only in the accessible label if extra context is desired without changing the visual UI.

## Validation

- Manual validation:
  1. Start a practice exam.
  2. Open the question map.
  3. Hover a numbered item on desktop.
  4. Confirm the browser tooltip shows that question's `prompt`.
  5. Click the item and confirm navigation still works.
  6. Confirm flagged/current/answered styling is unchanged.
- Automated validation:
  1. Add a Playwright test under `/home/runner/work/acn-fde/acn-fde/src/qa-tests/` that starts an exam, opens the map, locates a question-map button, and asserts it has a `title` attribute containing the expected prompt.
  2. Optionally also assert the `aria-label` includes the prompt text.

## Risks and edge cases

- Native browser tooltips are not themeable and vary by browser and OS.
- `title` is primarily a mouse-hover affordance and is not a strong touch/mobile UX.
- Long prompts may display differently across browsers.
- If a styled tooltip is later required, that would be a larger follow-up because this repository does not currently include a tooltip component.
