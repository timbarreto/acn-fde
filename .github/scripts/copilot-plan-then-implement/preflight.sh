#!/usr/bin/env bash

# Required environment: GH_TOKEN, TASK_REQUEST, MODEL_REQUEST, BASE_INPUT,
# DEFAULT_BASE, GITHUB_REPOSITORY, RUNNER_TEMP, and GITHUB_ENV.

set -euo pipefail

if [[ -z "${GH_TOKEN:-}" ]]; then
  echo "COPILOT_AGENT_PAT is not configured as an Actions repository secret." >&2
  exit 1
fi

if [[ ! "$TASK_REQUEST" =~ [^[:space:]] ]]; then
  echo "The task input must contain non-whitespace text." >&2
  exit 1
fi

# Keep this allowlist synchronized with the choice options in the entry workflow.
case "$MODEL_REQUEST" in
  auto|gpt-5.4|gpt-5.3-codex|gpt-5.2-codex|claude-opus-4.6|claude-sonnet-4.6|claude-opus-4.5|claude-sonnet-4.5)
    ;;
  *)
    echo "Unsupported model '$MODEL_REQUEST'. Choose a model offered by the workflow dispatch form." >&2
    exit 1
    ;;
esac

gh api user >/dev/null

base_branch="$BASE_INPUT"
if [[ -z "$base_branch" ]]; then
  base_branch="$DEFAULT_BASE"
fi

owner="${GITHUB_REPOSITORY%%/*}"
repository="${GITHUB_REPOSITORY#*/}"
qualified_base="refs/heads/${base_branch}"
plan_expression="${base_branch}:PLAN.md"

# GraphQL variable names must remain literal for the API request.
# shellcheck disable=SC2016
gh api graphql \
  -f query='query($owner: String!, $repository: String!, $qualifiedBase: String!, $planExpression: String!) {
    repository(owner: $owner, name: $repository) {
      base: ref(qualifiedName: $qualifiedBase) { name }
      plan: object(expression: $planExpression) { __typename }
    }
  }' \
  -F owner="$owner" \
  -F repository="$repository" \
  -F qualifiedBase="$qualified_base" \
  -F planExpression="$plan_expression" \
  > "$RUNNER_TEMP/base-preflight.json"

if ! jq -e '.data.repository.base != null' "$RUNNER_TEMP/base-preflight.json" >/dev/null; then
  echo "Base branch '$base_branch' does not exist or is not accessible." >&2
  exit 1
fi

if ! jq -e '.data.repository.plan == null' "$RUNNER_TEMP/base-preflight.json" >/dev/null; then
  echo "The base branch already contains root PLAN.md; refusing to overwrite it." >&2
  exit 1
fi

if ! gh api \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  "agents/repos/${GITHUB_REPOSITORY}/tasks?per_page=1" \
  >/dev/null; then
  echo "COPILOT_AGENT_PAT must have Agent tasks read and write access to this repository." >&2
  exit 1
fi

printf 'RESOLVED_BASE=%s\n' "$base_branch" >> "$GITHUB_ENV"
