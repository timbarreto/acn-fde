#!/usr/bin/env bash

# Required environment: GH_TOKEN, PR_NODE_ID, PR_NUMBER, PR_URL,
# EXPECTED_BASE, EXPECTED_HEAD, APPROVED_SHA, GITHUB_REPOSITORY, and RUNNER_TEMP.

set -euo pipefail

if [[ -z "${GH_TOKEN:-}" ]]; then
  echo "COPILOT_AGENT_PAT is not configured as an Actions repository secret." >&2
  exit 1
fi

gh api user >/dev/null
gh api "repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}" > "$RUNNER_TEMP/approved-pr.json"
if ! jq -e \
  --argjson number "$PR_NUMBER" \
  --arg node_id "$PR_NODE_ID" \
  --arg url "$PR_URL" \
  --arg base "$EXPECTED_BASE" \
  --arg head "$EXPECTED_HEAD" \
  --arg sha "$APPROVED_SHA" \
  '.number == $number and .node_id == $node_id and .html_url == $url and .state == "open" and .draft == true and .base.ref == $base and .head.ref == $head and .head.sha == $sha' \
  "$RUNNER_TEMP/approved-pr.json" >/dev/null; then
  echo "The plan pull request changed after validation; implementation will not start." >&2
  exit 1
fi

gh api --paginate \
  "repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}/files?per_page=100" \
  --slurp > "$RUNNER_TEMP/approved-pr-files.json"
if ! jq -e \
  '([.[][]] | length) == 1 and .[0][0].filename == "PLAN.md" and .[0][0].status == "added"' \
  "$RUNNER_TEMP/approved-pr-files.json" >/dev/null; then
  echo "The approved pull request no longer contains only PLAN.md." >&2
  exit 1
fi

gh api -X GET \
  "repos/${GITHUB_REPOSITORY}/contents/PLAN.md" \
  -f ref="$APPROVED_SHA" \
  --jq '.size' \
  | grep -Eq '^[1-9][0-9]*$'
