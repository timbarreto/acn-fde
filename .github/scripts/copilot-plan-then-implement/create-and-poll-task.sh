#!/usr/bin/env bash

# Required environment: GH_TOKEN, TASK_REQUEST, MODEL_REQUEST, RESOLVED_BASE,
# GITHUB_REPOSITORY, RUNNER_TEMP, GITHUB_OUTPUT, and GITHUB_STEP_SUMMARY.

set -euo pipefail

prompt_file="$RUNNER_TEMP/copilot-plan-prompt.md"
task_request="$RUNNER_TEMP/copilot-task-request.json"
task_response="$RUNNER_TEMP/copilot-task-response.json"
task_status="$RUNNER_TEMP/copilot-task-status.json"

cp .github/scripts/copilot-plan-then-implement/planning-prompt.md "$prompt_file"
{
  printf '\n## User task\n'
  # TASK_REQUEST is supplied by the reusable workflow.
  # shellcheck disable=SC2153
  printf '%s\n' "$TASK_REQUEST"
} >> "$prompt_file"

jq -n \
  --rawfile prompt "$prompt_file" \
  --arg base_ref "$RESOLVED_BASE" \
  --arg model "$MODEL_REQUEST" \
  '{prompt: $prompt, base_ref: $base_ref, create_pull_request: true}
    + (if $model == "auto" then {} else {model: $model} end)' \
  > "$task_request"

if ! gh api --method POST \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  "agents/repos/${GITHUB_REPOSITORY}/tasks" \
  --input "$task_request" \
  > "$task_response"; then
  echo "The Agent Tasks API could not start the Copilot task with requested model '$MODEL_REQUEST'." >&2
  echo "Model availability depends on the Copilot plan and organization policy; also verify token permissions and repository availability." >&2
  exit 1
fi

if ! jq -e \
  '(.id | type) == "string" and (.id | test("^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$")) and (.html_url | type) == "string" and (.html_url | length) > 0' \
  "$task_response" >/dev/null; then
  echo "The Agent Tasks API returned an invalid task identity." >&2
  exit 1
fi

task_id="$(jq -r '.id' "$task_response")"
task_url="$(jq -r '.html_url' "$task_response")"
deadline="$(( $(date +%s) + 19800 ))"
last_state=""
consecutive_fetch_failures=0

while true; do
  if ! gh api \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2026-03-10" \
    "agents/repos/${GITHUB_REPOSITORY}/tasks/${task_id}" \
    > "$task_status"; then
    consecutive_fetch_failures="$((consecutive_fetch_failures + 1))"
    if (( consecutive_fetch_failures >= 5 )); then
      echo "The Agent Tasks API failed five consecutive status requests." >&2
      exit 1
    fi
    echo "The Agent Tasks API status request failed; retrying ($consecutive_fetch_failures/5)." >&2
    sleep 5
    continue
  fi
  consecutive_fetch_failures=0

  if ! jq -e --arg task_id "$task_id" \
    '.id == $task_id and (.state | type) == "string"' \
    "$task_status" >/dev/null; then
    echo "The Agent Tasks API returned status for an unexpected task." >&2
    exit 1
  fi

  state="$(jq -r '.state' "$task_status")"
  if [[ "$state" != "$last_state" ]]; then
    printf 'Copilot task %s state: %s\n' "$task_id" "$state"
    last_state="$state"
  fi

  case "$state" in
    completed)
      break
      ;;
    queued|in_progress)
      ;;
    failed|idle|waiting_for_user|timed_out|cancelled)
      echo "Copilot task ended without a completed plan: $state." >&2
      exit 1
      ;;
    *)
      echo "Copilot task returned an unknown state: $state." >&2
      exit 1
      ;;
  esac

  if (( $(date +%s) >= deadline )); then
    echo "Timed out waiting for the Copilot task to complete." >&2
    exit 1
  fi
  sleep 15
done

reported_model="$(jq -r '
  [.sessions[]?
    | select(.state == "completed")
    | select((.model | type) == "string" and (.model | length) > 0)
    | .model]
  | last // empty
' "$task_status")"

printf 'task_id=%s\n' "$task_id" >> "$GITHUB_OUTPUT"
# Backticks in the summary are literal Markdown delimiters.
# shellcheck disable=SC2016
{
  printf 'Copilot task: %s\n\n' "$task_url"
  printf 'Final task state: `%s`\n\n' "$state"
  printf 'Requested model: `%s`\n\n' "$MODEL_REQUEST"
  if [[ -n "$reported_model" ]]; then
    printf 'Completed session model: `%s`\n' "$reported_model"
  else
    printf 'Completed session model: _not reported by the Agent Tasks API_\n'
  fi
} >> "$GITHUB_STEP_SUMMARY"
