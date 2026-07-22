Planning subagent: context7-plan-review

# Plan

## Scope

Update the footer link text in the bottom-left/bottom area from `Official credential` to `Agentic AI  Developer` without changing any other behavior.

## Repository findings

- Relevant UI location: `/home/runner/work/acn-fde/acn-fde/src/App.tsx:862-869`
- Exact current text location: `/home/runner/work/acn-fde/acn-fde/src/App.tsx:868`
- Existing unit test file: `/home/runner/work/acn-fde/acn-fde/src/App.test.tsx`
- Existing Playwright smoke test file: `/home/runner/work/acn-fde/acn-fde/src/qa-tests/home.spec.ts`

## Dependency versions

- React: `19.2.7`
- React DOM: `19.2.7`
- Playwright: `1.61.1`
- Vitest: `4.1.10`

## Context7 evidence

### React exact version match

- Installed version: `19.2.7`
- Context7 library: `/react/react/v19.2.7`
- Evidence used by the planning subagent: React v19.2.7 documentation shows standard JSX text rendering within component output, which matches this task as a direct literal text change in a React component.

### Playwright validation guidance

- Installed version: `1.61.1`
- Closest Context7 version reviewed: `/microsoft/playwright/v1.61.0`
- Evidence used by the planning subagent: Playwright documentation recommends role-based locators with accessible names and visibility assertions, which fits validating the footer link text.

## Ordered implementation steps

1. Confirm whether the requested text must preserve two visible spaces in `Agentic AI  Developer`, because normal JSX/HTML whitespace collapses visually.
2. Update only the footer link text in `/home/runner/work/acn-fde/acn-fde/src/App.tsx:868`.
3. Keep the existing footer link URL, icon, classes, and link attributes unchanged.
4. Add regression coverage in `/home/runner/work/acn-fde/acn-fde/src/qa-tests/home.spec.ts` by asserting the footer link is visible with the new accessible name.
5. Optionally add a fast rendered-markup assertion in `/home/runner/work/acn-fde/acn-fde/src/App.test.tsx` for the updated footer copy.

## Validation

- Automated:
  - Assert the footer link is visible with the new accessible name in Playwright.
  - Optionally assert the rendered markup contains the updated text in Vitest.
- Manual:
  - Open the homepage and verify the footer text displays as requested.
  - Verify the footer link still points to `https://learn.microsoft.com/en-us/credentials/certifications/agentic-ai-developer/`.
  - Check the footer in both mobile and `sm+` layouts.

## Risks

1. The requested double space in `Agentic AI  Developer` may collapse to a single visible space unless non-breaking spaces or whitespace-preserving handling is used.
2. The replacement label is longer than `Official credential` and may wrap differently on smaller widths.
3. The phrase “bottom left” may refer to the footer CTA currently found in `/home/runner/work/acn-fde/acn-fde/src/App.tsx:868`; if it refers to a different element, the target would need clarification.

## Notes

- This file persists the read-only planning subagent result only.
- No implementation is performed in this planning-only change.
