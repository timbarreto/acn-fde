# Domain Docs

How the engineering skills should consume this repository's domain
documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repository root.
- **`docs/adr/`** for decisions that touch the area being changed.

If these files do not exist, proceed silently. Do not suggest creating them
upfront. The `/domain-modeling` skill, reached through `/grill-with-docs` and
`/improve-codebase-architecture`, creates them lazily when terms or decisions
are resolved.

## File structure

This repository uses the recommended single-context layout:

```text
/
├── CONTEXT.md
├── docs/
│   └── adr/
│       ├── 0001-example-decision.md
│       └── 0002-another-decision.md
└── src/
```

## Use the glossary's vocabulary

When output names a domain concept in an issue title, refactor proposal,
hypothesis, or test name, use the term defined in `CONTEXT.md`. Do not drift to
synonyms that the glossary explicitly avoids.

If a needed concept is missing, reconsider whether the term belongs to the
project or note the gap for `/domain-modeling`.

## Flag ADR conflicts

If output contradicts an existing ADR, surface the conflict explicitly instead
of silently overriding it.
