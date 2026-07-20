---
emoji: 🎭
name: Playwright QA Tests
description: Run the repository's Playwright QA test suite on qa-tester-agent branch pushes and manual dispatches
on:
  workflow_dispatch: {}
  push:
    branches: [qa-tester-agent]
permissions:
  contents: read
strict: true
timeout-minutes: 30
concurrency:
  group: "gh-aw-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref || github.run_id }}"
  cancel-in-progress: true
engine:
  id: copilot
  env:
    COPILOT_PROVIDER_BASE_URL: https://openrouter.ai/api/v1
    COPILOT_PROVIDER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
    COPILOT_PROVIDER_TYPE: openai
    COPILOT_MODEL: deepseek/deepseek-v4-flash
network:
  allowed:
    - defaults
    - node
    - playwright
    - local
    - openrouter.ai
tools:
  bash: ["*"]
safe-outputs:
  noop:
    max: 1
    report-as-issue: false
  report-failure-as-issue: false
---

# Playwright QA Tests

Run the repository's full Playwright QA suite.

1. Read and apply the repository's `qa-tests` skill.
2. Install dependencies and the configured Chromium browser.
3. Run the full QA suite.
4. If a command fails, inspect the available Playwright output and artifacts, identify the failing spec and likely cause, and report the failure clearly. Do not modify repository files.
5. If all tests pass, report the passing test count.
6. Call `noop` with the test result summary because this workflow does not require a GitHub write.
