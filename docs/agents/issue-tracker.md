# Issue tracker: GitHub

Issues and PRDs for this repository live in GitHub Issues at
`timbarreto/acn-fde`. Prefer the repository-provided `gh-axi` wrapper for
GitHub operations.

## Conventions

- **Create an issue**:
  `gh-axi issue create --title "..." --body-file <path>`.
- **Read an issue**: `gh-axi issue view <number> --comments --full`.
- **List issues**:
  `gh-axi issue list --state open --fields number,title,body,labels,comments`,
  with appropriate `--label` and `--state` filters.
- **Comment on an issue**:
  `gh-axi issue comment <number> --body-file <path>`.
- **Apply or remove labels**:
  `gh-axi issue edit <number> --add-label "..."` or
  `--remove-label "..."`.
- **Close an issue**:
  `gh-axi issue close <number> --reason completed --comment "..."`.

Run commands from this repository so the GitHub remote resolves to
`timbarreto/acn-fde`.

## Pull requests as a triage surface

**PRs as a request surface: no.** Set this to `yes` only if this repository
later chooses to treat external pull requests as feature requests; `/triage`
reads this flag.

When set to `yes`, external pull requests run through the same labels and
states as issues. GitHub shares one number space across issues and pull
requests, so resolve an ambiguous `#42` by checking the pull request first and
then the issue.

## When a skill says "publish to the issue tracker"

Create a GitHub issue in `timbarreto/acn-fde`.

## When a skill says "fetch the relevant ticket"

Run `gh-axi issue view <number> --comments --full` from this repository.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as
tickets.

- **Map**: an issue labelled `wayfinder:map`, holding the Notes,
  Decisions-so-far, and Fog sections.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue. Use
  `gh-axi issue subissue add <map> <child>`. Labels use
  `wayfinder:<type>` (`research`, `prototype`, `grilling`, or `task`). Once
  claimed, assign the ticket to the driving developer.
- **Blocking**: use GitHub's native issue dependencies when available. If the
  wrapper does not expose the needed operation, use its documented fallback
  mechanism rather than guessing flags. Otherwise, put
  `Blocked by: #<number>` at the top of the child body.
- **Frontier query**: list the map's open children, then drop tickets with an
  open blocker or an assignee; first in map order wins.
- **Claim**: assign the ticket to the driving developer. This is the session's
  first write.
- **Resolve**: comment with the answer, close the child, then append a context
  pointer and link to the map's Decisions-so-far.
