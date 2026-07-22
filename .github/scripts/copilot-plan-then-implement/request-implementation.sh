#!/usr/bin/env bash

# Required environment: GH_TOKEN, PR_NUMBER, PR_URL, EXPECTED_BASE,
# EXPECTED_HEAD, APPROVED_SHA, GITHUB_REPOSITORY, GITHUB_RUN_ID, RUNNER_TEMP,
# and GITHUB_STEP_SUMMARY.

set -euo pipefail

marker="<!-- copilot-plan-then-implement:${GITHUB_RUN_ID} -->"
gh api --paginate \
  "repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments?per_page=100" \
  --slurp > "$RUNNER_TEMP/pr-comments.json"

if jq -e --arg marker "$marker" \
  'any(.[][]; (.body // "") | contains($marker))' \
  "$RUNNER_TEMP/pr-comments.json" >/dev/null; then
  echo "The implementation request for this workflow run is already present on the PR."
  exit 0
fi

comment_file="$RUNNER_TEMP/copilot-implementation-request.md"
# Backticks in the comment are literal Markdown delimiters.
# shellcheck disable=SC2016
{
  printf '%s\n' \
    '@copilot Implement the human-approved `PLAN.md` on this existing pull request.' \
    '' \
    "The approved plan is pinned to commit \`$APPROVED_SHA\`. Work only on this PR's existing head branch \`$EXPECTED_HEAD\` and keep its base as \`$EXPECTED_BASE\`." \
    'Follow the approved plan closely and keep all changes scoped to it.' \
    'Remove the temporary root `PLAN.md` before finishing; it must not remain in the final diff.' \
    'Run `npm run test`, `npm run lint`, and `npm run build` and address failures caused by the implementation.' \
    'Do not run `npm run test:qa` or any Playwright QA tests.' \
    'Do not merge the pull request. Mark it ready for review only after the implementation is complete, `PLAN.md` is removed, and all three required validations pass.' \
    '' \
    "$marker"
} > "$comment_file"

gh pr comment \
  --repo "$GITHUB_REPOSITORY" \
  "$PR_NUMBER" \
  --body-file "$comment_file"

# Backticks in the summary are literal Markdown delimiters.
# shellcheck disable=SC2016
printf 'Implementation requested on %s at approved SHA `%s`.\n' \
  "$PR_URL" "$APPROVED_SHA" >> "$GITHUB_STEP_SUMMARY"
