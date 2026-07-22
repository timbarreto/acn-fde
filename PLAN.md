# Implementation Plan: Update Footer Link Text

Planning subagent: context7-plan-review

## Summary

Change the footer link text from `Official credential` to `Agentic AI  Developer` (note: two spaces between "AI" and "Developer" as specified in the task) in `src/App.tsx`.

---

## Dependency Versions Used

| Dependency | Installed Version (from `package.json`) |
|---|---|
| React | ^19.1.1 |
| react-dom | ^19.1.1 |
| Vite | ^7.1.2 |
| Tailwind CSS | ^3.4.17 |
| lucide-react | ^0.468.0 |
| TypeScript | ~5.8.3 |

---

## Context7 Evidence

**Library**: React v19.2.7 (closest documented version to ^19.1.1)
**Finding**: React renders inline JSX text strings as safe text nodes via `document.createTextNode()` and updates them using `textContent` / `nodeValue`. Changing a static string literal inside JSX simply causes React to update the text node on reconciliation — no special API, prop, or escape handling is needed. Multiple consecutive whitespace characters in JSX source are collapsed to a single space by the JSX transform (standard HTML whitespace rules apply). If the intent is to render two literal spaces, a `{' '}` expression or `&nbsp;` entity would be needed.

**Source**: React DOM bindings `setTextContent.js` and reconciler `ReactChildFiber.js` (Context7 `/react/react/v19.2.7`).

---

## Affected File

| File | Line (approx.) | Current Text | New Text |
|---|---|---|---|
| `src/App.tsx` | Inside the `<footer>` JSX block | `Official credential` | `Agentic AI  Developer` (see whitespace note below) |

The specific JSX element:

```tsx
<a href="https://learn.microsoft.com/en-us/credentials/certifications/agentic-ai-developer/"
   target="_blank" rel="noreferrer"
   className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold text-brand-bright hover:underline">
  <Github className="h-4 w-4" /> Official credential
</a>
```

---

## Ordered Implementation Steps

1. **Open** `src/App.tsx`.
2. **Locate** the `<a>` element inside the `<footer>` whose text content is `Official credential` (search for that exact string — it appears once in the file).
3. **Replace** the text `Official credential` with `Agentic AI  Developer`.
   - **Whitespace note**: The task specifies two spaces between "AI" and "Developer". In JSX, consecutive whitespace in text content is collapsed to one space by the compiler (same as HTML). To preserve a double-space visually:
     - Option A (recommended): Use `Agentic AI{'\u00A0'} Developer` or `Agentic AI&nbsp; Developer` — renders a non-breaking space followed by a regular space.
     - Option B: Simply write `Agentic AI Developer` (single space) if the double-space was unintentional in the task description.
   - If only a single space was intended, the replacement is trivial: `Agentic AI Developer`.
4. **Save** the file. No other files require changes.

---

## Validation Steps

1. **Build check**: Run `npm run build` — must succeed with zero TypeScript or Vite errors.
2. **Lint check**: Run `npm run lint` — must pass.
3. **Unit tests**: Run `npm run test` — all existing tests must pass (text change is static; unlikely to break tests unless a test asserts on the exact string).
4. **E2E / QA tests**: Run `npm run test:qa` (Playwright) — verify no test explicitly matches `"Official credential"`. If one does, update the assertion to `"Agentic AI Developer"`.
5. **Visual verification**: Run `npm run dev`, open the app, scroll to the footer, and confirm:
   - The link reads **Agentic AI Developer**.
   - The GitHub icon still appears to the left.
   - The link still navigates to `https://learn.microsoft.com/en-us/credentials/certifications/agentic-ai-developer/`.
   - No layout shift or styling regression.

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| A Playwright or Vitest assertion matches the old text `"Official credential"` | Low | Search test files for the string; update if found. |
| Double-space in "AI  Developer" is silently collapsed to single space by JSX transform | Low | Use `&nbsp;` or a JS expression if literal double-space is required (see step 3 above). |
| No functional or behavioural risk | — | This is a static text-only change; no logic, state, routing, or API calls are affected. |

---

## Conclusion

This is a single-line, text-only change in `src/App.tsx` with no impact on application logic, styling, or dependencies. The primary consideration is whether the double-space in the target text is intentional (requiring an `&nbsp;` workaround) or a typo (in which case a simple string replacement suffices).
