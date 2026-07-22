#!/usr/bin/env bash

# Required environment: GH_TOKEN, TASK_ID, RESOLVED_BASE, GITHUB_REPOSITORY,
# RUNNER_TEMP, GITHUB_OUTPUT, and GITHUB_STEP_SUMMARY.

set -euo pipefail

completed_task="$RUNNER_TEMP/copilot-task-status.json"

if ! jq -e --arg task_id "$TASK_ID" \
  '.id == $task_id and .state == "completed" and ([.artifacts[]? | select(.provider == "github" and .type == "pull" and (.data.global_id | type) == "string" and (.data.global_id | length) > 0)] | length) == 1' \
  "$completed_task" >/dev/null; then
  echo "The exact completed Copilot task does not have one pull request artifact." >&2
  exit 1
fi

pr_node_id="$(jq -r '[.artifacts[] | select(.provider == "github" and .type == "pull" and (.data.global_id | type) == "string" and (.data.global_id | length) > 0)][0].data.global_id' "$completed_task")"
# The GraphQL variable name must remain literal for the API request.
# shellcheck disable=SC2016
gh api graphql \
  -f query='query($id: ID!) {
    node(id: $id) {
      __typename
      ... on PullRequest {
        id
        number
        url
        repository { nameWithOwner }
      }
    }
  }' \
  -F id="$pr_node_id" \
  > "$RUNNER_TEMP/plan-pr-node.json"

if ! jq -e \
  --arg node_id "$pr_node_id" \
  --arg repository "$GITHUB_REPOSITORY" \
  '.data.node.__typename == "PullRequest" and .data.node.id == $node_id and .data.node.repository.nameWithOwner == $repository' \
  "$RUNNER_TEMP/plan-pr-node.json" >/dev/null; then
  echo "The Copilot task pull artifact does not resolve to a pull request in this repository." >&2
  exit 1
fi

pr_number="$(jq -r '.data.node.number | tostring' "$RUNNER_TEMP/plan-pr-node.json")"
if [[ ! "$pr_number" =~ ^[1-9][0-9]*$ ]]; then
  echo "The Copilot task returned an invalid pull request number." >&2
  exit 1
fi

gh api "repos/${GITHUB_REPOSITORY}/pulls/${pr_number}" > "$RUNNER_TEMP/plan-pr.json"
if [[ "$(jq -r '.state' "$RUNNER_TEMP/plan-pr.json")" != "open" ]]; then
  echo "The plan pull request is not open." >&2
  exit 1
fi

if [[ "$(jq -r '.draft' "$RUNNER_TEMP/plan-pr.json")" != "true" ]]; then
  gh pr ready --repo "$GITHUB_REPOSITORY" "$pr_number" --undo
  gh api "repos/${GITHUB_REPOSITORY}/pulls/${pr_number}" > "$RUNNER_TEMP/plan-pr.json"
fi

pr_url="$(jq -r '.html_url' "$RUNNER_TEMP/plan-pr.json")"
pr_base="$(jq -r '.base.ref' "$RUNNER_TEMP/plan-pr.json")"
head_branch="$(jq -r '.head.ref' "$RUNNER_TEMP/plan-pr.json")"
head_sha="$(jq -r '.head.sha' "$RUNNER_TEMP/plan-pr.json")"

if [[ "$(jq -r '.number' "$RUNNER_TEMP/plan-pr.json")" != "$pr_number" ]] ||
  [[ "$(jq -r '.node_id' "$RUNNER_TEMP/plan-pr.json")" != "$pr_node_id" ]] ||
  [[ "$(jq -r '.html_url' "$RUNNER_TEMP/plan-pr.json")" != "$(jq -r '.data.node.url' "$RUNNER_TEMP/plan-pr-node.json")" ]] ||
  [[ "$pr_base" != "$RESOLVED_BASE" ]] ||
  [[ "$(jq -r '.draft' "$RUNNER_TEMP/plan-pr.json")" != "true" ]] ||
  [[ -z "$head_branch" ]] ||
  [[ ! "$head_sha" =~ ^[0-9A-Fa-f]{40}$ ]]; then
  echo "The plan pull request identity, base, draft state, or head is invalid." >&2
  exit 1
fi

gh api --paginate \
  "repos/${GITHUB_REPOSITORY}/pulls/${pr_number}/files?per_page=100" \
  --slurp > "$RUNNER_TEMP/plan-pr-files.json"

if ! jq -e \
  '([.[][]] | length) == 1 and .[0][0].filename == "PLAN.md" and .[0][0].status == "added"' \
  "$RUNNER_TEMP/plan-pr-files.json" >/dev/null; then
  echo "The plan pull request must add only root PLAN.md." >&2
  exit 1
fi

gh api -X GET \
  "repos/${GITHUB_REPOSITORY}/contents/PLAN.md" \
  -f ref="$head_sha" \
  > "$RUNNER_TEMP/plan-file.json"

if ! jq -e '.type == "file" and .encoding == "base64" and .size > 0' \
  "$RUNNER_TEMP/plan-file.json" >/dev/null; then
  echo "PLAN.md is missing or empty at the plan pull request head." >&2
  exit 1
fi

jq -r '.content' "$RUNNER_TEMP/plan-file.json" \
  | base64 --decode > "$RUNNER_TEMP/approved-plan.md"
if ! grep -q '[^[:space:]]' "$RUNNER_TEMP/approved-plan.md" ||
  ! grep -Fxq 'Planning subagent: context7-plan-review' "$RUNNER_TEMP/approved-plan.md"; then
  echo "PLAN.md is empty or lacks the required planning-subagent evidence." >&2
  exit 1
fi

{
  printf 'task_id=%s\n' "$TASK_ID"
  printf 'pr_node_id=%s\n' "$pr_node_id"
  printf 'pr_number=%s\n' "$pr_number"
  printf 'pr_url=%s\n' "$pr_url"
  printf 'head_branch=%s\n' "$head_branch"
  printf 'head_sha=%s\n' "$head_sha"
  printf 'base_branch=%s\n' "$pr_base"
} >> "$GITHUB_OUTPUT"

# Backticks in the summary are literal Markdown delimiters.
# shellcheck disable=SC2016
{
  printf 'Plan PR: %s\n\n' "$pr_url"
  printf 'Approved head candidate: `%s`\n' "$head_sha"
} >> "$GITHUB_STEP_SUMMARY"
