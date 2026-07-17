# GH-600 Public Study Guide

Markdown-only workbook for Exam GH-600: Developing in Agentic AI Systems.

Last updated: May 24, 2026.

This version is organized around the official GH-600 domains. Each domain explains the concepts, shows the GitHub implementation artifacts, and includes examples you should be able to read in YAML, Markdown, CLI output, PR timelines, and audit logs.

Public sharing note: this guide is not an exam dump and does not contain real exam questions or answer choices. It is a structured study workbook built from official Microsoft and GitHub documentation, with practical examples written for learning and review.

Primary source of truth:

- GH-600 Microsoft Learn study guide: https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/gh-600
- GitHub Copilot cloud agent docs: https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent
- GitHub Copilot CLI docs: https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference
- GitHub Copilot CLI config directory: https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference
- GitHub custom agents configuration: https://docs.github.com/en/copilot/reference/custom-agents-configuration
- GitHub customization cheat sheet: https://docs.github.com/en/copilot/reference/customization-cheat-sheet
- GitHub Actions workflow syntax: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
- GitHub Actions contexts: https://docs.github.com/en/actions/reference/workflows-and-actions/contexts
- GitHub audit log events: https://docs.github.com/en/enterprise-cloud@latest/admin/monitoring-activity-in-your-enterprise/reviewing-audit-logs-for-your-enterprise/audit-log-events-for-your-enterprise

Use the official GH-600 skills outline as the map, then use the linked GitHub Docs pages for exact syntax and product behavior.

## 1. Exam Map And Study Model

The exam domains:

| Domain | Weight | What it means in practice |
|---|---:|---|
| Prepare agent architecture and SDLC processes | 15-20% | Choose good agent tasks, define outputs, manage autonomy, use PR/check/review flow |
| Implement tool use and environment interaction | 20-25% | Custom agents, tools, MCP, CLI, cloud-agent setup, CI workflows, branches, PRs |
| Manage memory, state, and execution | 10-15% | Sessions, resume/continue, Copilot Memory, durable artifacts, context drift |
| Perform evaluation, error analysis, and tuning | 15-20% | Logs, scans, workflow artifacts, root cause, instructions/tools/environment tuning |
| Orchestrate multi-agent coordination | 15-20% | `/fleet`, `agent` tool, matrix jobs, `needs`, artifacts, conflict prevention |
| Implement guardrails and accountability | 10-15% | Least privilege, hooks, branch protection, workflow approvals, audit logs |

The key is not just knowing definitions. GH-600 expects you to recognize implementation evidence:

| Concept | Artifact examples |
|---|---|
| Agent profile | `.github/agents/*.agent.md` |
| Instructions | `.github/copilot-instructions.md`, `.github/instructions/*.instructions.md`, `AGENTS.md` |
| Prompt/skill reuse | `.github/prompts/*.prompt.md`, `.github/skills/<skill>/SKILL.md` |
| Tools | `tools: [read, search, edit, execute, agent]` |
| MCP | `mcp-servers` in agent YAML, `mcpServers` in JSON |
| Cloud setup | `.github/workflows/copilot-setup-steps.yml` |
| CI invocation | `copilot -p`, `--agent`, `COPILOT_GITHUB_TOKEN`, `--no-ask-user` |
| Workflow orchestration | `needs`, `strategy.matrix`, artifacts, `$GITHUB_OUTPUT` |
| Overlap control | top-level or job-level `concurrency` |
| Evaluation | tests, scans, session logs, workflow artifacts |
| Accountability | PR timeline, session logs, audit log events |

## 2. Domain 1: Prepare Agent Architecture And SDLC Processes

### What This Domain Tests

This domain asks whether you can decide where an agent belongs in a software delivery workflow. The right answer usually preserves GitHub-native accountability: issue, branch, PR, checks, review, merge.

Use an agent when:

- Inputs and outputs are clear.
- Work can be scoped to a repository, branch, issue, PR, or workflow.
- The result can be reviewed through a diff, artifact, log, or check.
- Tests/scans/reviews can validate the output.
- The agent can operate with least-privilege tools and permissions.

Do not rely only on an agent when:

- The task has unclear success criteria.
- The task is irreversible or production-sensitive.
- The agent would need broad secrets or broad external write access.
- The agent would approve its own output.
- Human judgment is required for policy, compliance, legal, security, or product decisions.

### Planning Versus Execution

Planning is reviewable intent. Execution changes state.

Use planning first for:

- Large refactors.
- Security-sensitive work.
- Workflow/deployment changes.
- Cross-repository work.
- Multi-agent coordination.
- Any task where a human should approve scope before edits.

Example plan artifact:

```markdown
# Agent plan

Goal: Update dependency review workflow.

Steps:
1. Inspect current workflow permissions.
2. Add dependency review gate.
3. Validate workflow syntax.
4. Open PR with risk notes.

Validation:
- Existing required checks still run.
- Dependency review runs on pull requests.
- PR requires human review.
```

What to notice:

- A plan is not validation.
- The plan becomes useful when it is stored in an issue, PR, comment, file, or workflow artifact.

### SDLC Pattern

Safe GitHub-native agent work:

1. Task is defined in a prompt, issue, or PR comment.
2. Agent works on a branch.
3. Agent commits changes.
4. Agent opens or updates a PR.
5. Workflow checks run.
6. CodeQL, secret scanning, dependency review, and tests provide evidence.
7. Humans inspect diff, session logs, and artifacts.
8. Branch protection/rulesets gate merge.
9. Audit logs and PR history preserve accountability.

### Autonomy Levels

| Level | Agent can do | Typical tools | Controls |
|---|---|---|---|
| Low | Read, search, summarize, plan | `read`, `search` | no write, no shell |
| Medium | Edit files, run tests, open PR | `read`, `search`, `edit`, `execute` | PR checks, required review |
| High | Use MCP, modify workflows, coordinate agents | `agent`, MCP tools, shell | narrow tools, hooks, approvals, audit |

Examples:

```yaml
# Low-autonomy reviewer
tools:
  - read
  - search
```

```yaml
# Medium-autonomy implementer
tools:
  - read
  - search
  - edit
  - execute
```

```yaml
# Coordinator
tools:
  - read
  - search
  - agent
```

### Domain 1 Traps

- "Tell the agent to be careful" is not a control.
- An agent-generated plan does not prove the implementation is safe.
- High autonomy requires enforceable controls: permissions, reviews, scans, rulesets, hooks, and logs.
- Do not let agents make unreviewed changes to protected or production-sensitive paths.

### Domain 1 Implementation Examples

Define success criteria before giving the agent tools.

Weak task:

```text
Improve the payment service.
```

Better task:

```text
Update payment retry logic so transient gateway failures retry three times with exponential backoff. Add unit tests for success, permanent failure, and transient retry. Do not modify public API contracts. Open a draft PR and include validation output.
```

Why it is better:

- Scope is bounded.
- Output is testable.
- API compatibility is explicit.
- The PR is reviewable.
- Validation is required.

Inputs, outputs, and controls:

| Element | Example |
|---|---|
| Input | issue, failing test, PR comment, workflow log, Sentry issue |
| Output | branch, commit, PR, test artifact, summary file |
| Success criteria | tests pass, scan clean, reviewer approves |
| Control | required checks, rulesets, limited tools, human review |
| Evidence | session log, PR diff, workflow logs, audit log |

Autonomy selection:

| Scenario | Better autonomy |
|---|---|
| Summarize repo conventions | low |
| Add tests for existing code | medium |
| Modify deployment workflow | high control, low initial autonomy |
| Use Jira/Sentry for diagnosis | medium/high with narrow MCP |
| Change production rollout behavior | human approval required |

### Domain 1 Self-Check

- What makes a task suitable for an agent?
- What artifact proves the plan was reviewed?
- What GitHub control blocks unreviewed merge?
- What is the difference between agent guidance and enforceable policy?

## 3. Domain 2: Implement Tool Use And Environment Interaction

This is the largest technical area. It covers custom agents, tools, MCP, Copilot CLI, cloud setup, workflow invocation, branches, PRs, and environment constraints.

### Copilot Customization File Inventory

Know these paths cold:

| File or directory | Purpose |
|---|---|
| `.github/copilot-instructions.md` | Repository-wide instructions |
| `.github/instructions/*.instructions.md` | Path-specific instructions |
| `AGENTS.md` | Agent-oriented instructions; nearest file can take precedence |
| `.github/prompts/*.prompt.md` | Reusable prompt templates |
| `.github/agents/*.md` or `.github/agents/*.agent.md` | Custom agent profiles |
| `.github/skills/<skill-name>/SKILL.md` | Agent skills |
| `.github/hooks/*.json` | CLI/cloud-agent hooks |
| `.github/workflows/copilot-setup-steps.yml` | Cloud-agent environment setup |
| `.mcp.json`, `.github/mcp.json`, `.vscode/mcp.json` | MCP config, depending on surface |

Repository instructions:

```markdown
# Repository instructions

Use npm for package management.
Run `npm test` before proposing a PR.
Do not edit files under `legacy/` unless explicitly asked.
```

Path-specific instructions:

```markdown
---
applyTo: "src/payments/**"
---

Payment changes must include tests for refunds, retries, and idempotency.
```

Prompt file:

```markdown
# Security review

Review selected changes for authentication, authorization, secret exposure, dependency risk, and workflow permission risk.
Return findings with severity, file path, and recommended fix.
```

Skill:

```markdown
---
name: actions-failure-debugging
description: Debug failing GitHub Actions workflows.
---

1. Inspect the failing job.
2. Identify the first failing command.
3. Check runner, permissions, secrets, and artifact paths.
4. Propose the smallest fix.
```

### Custom Agent YAML

Repository agent path:

```text
.github/agents/reviewer.agent.md
```

Organization or enterprise custom agents can live under `/agents/` in a `.github-private` repository.

Minimal read-only reviewer:

```markdown
---
name: reviewer
description: Reviews changes and writes concise findings.
tools:
  - read
  - search
---

Review repository changes. Do not edit files. Report findings with file paths and rationale.
```

Important frontmatter:

| Key | Meaning |
|---|---|
| `description` | Required purpose/capability description |
| `name` | Optional display name |
| `tools` | Tool list available to the agent |
| `mcp-servers` | MCP config in YAML form |
| `target` | Surface such as `github-copilot` or `vscode` |
| `model` | Model choice where supported |
| `disable-model-invocation` | Prevent inferred invocation |
| `user-invocable` | Whether users can invoke directly |
| `metadata` | Extra metadata |

Traps:

- `description` is required; `name` is not the required field.
- If `tools` is omitted, all available tools may be enabled.
- `tools: []` disables tools.
- `handoffs` may appear in other formats, but is ignored by Copilot cloud agent.

### Tool Meanings

| Tool | Meaning | Use when |
|---|---|---|
| `read` | Read file contents | Agent must inspect files |
| `search` | Search files/text in repository | Agent must find code/files |
| `edit` | Edit/write files | Agent must modify files |
| `execute` | Run shell commands | Agent must run tests/scripts |
| `agent` | Invoke another custom agent | Agent coordinates subagents |
| `web` | Fetch URLs/web search | Not applicable for cloud agent today |
| `todo` | Task list | Not supported in cloud agent today |

Least-privilege choices:

```yaml
# Inspect but do not edit
tools:
  - read
  - search
```

```yaml
# Modify files and run tests
tools:
  - read
  - search
  - edit
  - execute
```

```yaml
# Orchestrate another specialist
tools:
  - read
  - search
  - agent
```

What to notice:

- `search` is repository search, not internet search.
- Add `edit` only when changes are required.
- Add `execute` only when shell execution is required.
- Add `agent` when invoking another custom agent.

### Agent-To-Agent Invocation

Custom-agent tool aliases for invoking another custom agent:

```text
agent
custom-agent
Task
```

Example orchestrator:

```markdown
---
name: orchestrator
description: Coordinates review, audit, and consolidation.
tools:
  - read
  - search
  - agent
---

Use the reviewer agent for code review.
Use the auditor agent for compliance and traceability.
Then consolidate both outputs into one recommendation.
```

### MCP In Agents

MCP exposes external tools and data sources.

Know this distinction:

| Surface | Key |
|---|---|
| Custom agent YAML | `mcp-servers` |
| MCP JSON config | `mcpServers` |

MCP inside custom agent:

```markdown
---
name: jira-triage
description: Reads Jira issue context and proposes repository changes.
tools:
  - read
  - search
  - jira/get_issue
mcp-servers:
  jira:
    type: local
    command: npx
    args:
      - -y
      - jira-mcp
    tools:
      - get_issue
    env:
      JIRA_TOKEN: ${{ secrets.COPILOT_MCP_JIRA_TOKEN }}
---

Use Jira only for issue context. Never print secrets.
```

MCP JSON:

```json
{
  "mcpServers": {
    "jira": {
      "type": "local",
      "command": "npx",
      "args": ["-y", "jira-mcp"],
      "tools": ["get_issue"],
      "env": {
        "JIRA_TOKEN": "$COPILOT_MCP_JIRA_TOKEN"
      }
    }
  }
}
```

### MCP Transport Types

This is a likely fill-in-the-blank area. Choose the MCP `type` from the shape of the server configuration.

| Server shape | `type` | Required fields | Meaning |
|---|---|---|---|
| local process | `local` or `stdio` | `command`, `args` | starts a subprocess and talks over stdin/stdout |
| remote Streamable HTTP server | `http` | `url` | connects to a remote MCP endpoint over HTTP |
| remote Server-Sent Events server | `sse` | `url` | legacy SSE transport, still supported |

Decision rule:

- If the config has top-level `command` and `args`, it is local process transport: `local` or `stdio`.
- If the config has top-level `url`, it is remote transport: usually `http`, or `sse` if the endpoint/documentation says SSE or the URL clearly uses an SSE endpoint.
- If the config has top-level `url` and the available choices do not include `http`, choose `sse` over `stdio`/`local`.
- Do not choose `stdio` for a top-level `url`-based server. `stdio` does not connect to a URL; it starts a local process.
- Modern remote MCP usually means `http`. `sse` exists for older Server-Sent Events MCP servers.
- Some UI labels say `HTTP/SSE`, but GitHub/Copilot JSON values are still `http` or `sse`.

Remote MCP JSON:

```json
{
  "mcpServers": {
    "context7": {
      "type": "http",
      "url": "https://mcp.context7.com/mcp",
      "headers": {
        "CONTEXT7_API_KEY": "$COPILOT_MCP_CONTEXT7_API_KEY"
      },
      "tools": ["*"]
    }
  }
}
```

Remote MCP in custom-agent YAML:

```markdown
---
name: docs-researcher
description: Reads approved external documentation through a remote MCP server.
tools:
  - read
  - search
  - context7/*
mcp-servers:
  context7:
    type: http
    url: https://mcp.context7.com/mcp
    headers:
      CONTEXT7_API_KEY: ${{ secrets.COPILOT_MCP_CONTEXT7_API_KEY }}
    tools:
      - "*"
---

Use Context7 only for library documentation.
```

SSE example:

```json
{
  "mcpServers": {
    "cloudflare": {
      "type": "sse",
      "url": "https://docs.mcp.cloudflare.com/sse",
      "tools": ["*"]
    }
  }
}
```

Important nuance: a URL can appear inside `args` for a local bridge command. In that case the MCP client is still launching a local process, so the top-level `type` remains `local` or `stdio`.

```json
{
  "mcpServers": {
    "atlassian-rovo-mcp": {
      "type": "local",
      "command": "npx",
      "args": [
        "mcp-remote@latest",
        "https://mcp.atlassian.com/v1/mcp",
        "--header",
        "Authorization: Basic $ATLASSIAN_API_KEY"
      ],
      "env": {
        "ATLASSIAN_API_KEY": "$COPILOT_MCP_ATLASSIAN_API_KEY"
      },
      "tools": ["*"]
    }
  }
}
```

How to read the artifact:

- Top-level `url`: remote MCP, choose `http` or `sse`.
- Top-level `url` and no `http` option: choose `sse`.
- URL inside `args` with `command: npx` or another executable: local bridge, choose `local` or `stdio`.
- `headers`: remote HTTP/SSE authentication.
- `env`: environment variables for local server process.
- For Copilot cloud agent, referenced secret/variable names must start with `COPILOT_MCP_`.
- Copilot cloud agent does not currently support remote MCP servers that rely on OAuth authorization.

Tool naming:

```yaml
tools:
  - jira/get_issue
  - github/*
```

Facts:

- `server/tool` exposes one tool.
- `server/*` exposes all tools from that server.
- GitHub MCP server is read-only by default and scoped to source repository.
- Playwright MCP is constrained to localhost by default.
- `.vscode/mcp.json` can be reused/adapted for cloud agent.

Adapting `.vscode/mcp.json`:

- Add `tools`.
- Replace `inputs` with `env`.
- Replace `envFile` with `env`.
- Store credentials as Agents secrets/variables.

MCP governance:

- MCP registry URL controls approved registry.
- `Registry only` is stricter than `Allow all`.
- Enterprise policy can override organization policy.
- MCP allowlist is different from firewall allowlist.
- Firewall governs network egress; MCP allowlist governs MCP server usage.

### Copilot CLI Basics

| Command/flag | Meaning |
|---|---|
| `copilot` | Start interactive CLI |
| `copilot login` | Authenticate |
| `copilot init` | Generate/update repository instructions |
| `copilot -p "..."` | Programmatic prompt |
| `--agent=NAME` | Use a custom agent |
| `--allow-tool` | Allow tool pattern |
| `--deny-tool` | Deny tool pattern |
| `--available-tools` | Limit visible tools |
| `--no-ask-user` | Prevent interactive questions |
| `--autopilot` | Local autonomous continuation |
| `--resume` | Resume named session |
| `--continue` | Continue latest session |
| `--output-format=json` | Machine-readable output |

Slash commands:

| Slash command | Meaning |
|---|---|
| `/plan` | Plan first |
| `/review` | Review changes |
| `/pr` | Pull request workflow |
| `/mcp` | Inspect/configure MCP |
| `/agent` | Select/manage custom agents |
| `/session` | Inspect session |
| `/ide` | Inspect/switch IDE connection |
| `/delegate` | Hand off to cloud agent |
| `/fleet` | Parallel subagent decomposition |

CI example:

```yaml
name: Copilot report

on:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  report:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v4
      - run: npm install -g @github/copilot
      - name: Run Copilot CLI
        env:
          COPILOT_GITHUB_TOKEN: ${{ secrets.PERSONAL_ACCESS_TOKEN }}
        run: |
          copilot -p "Summarize the current branch in summary.md" \
            --allow-tool='read,search,edit,shell(git:*)' \
            --no-ask-user
          cat summary.md >> "$GITHUB_STEP_SUMMARY"
```

What to notice:

- `COPILOT_GITHUB_TOKEN` authenticates the CLI in GitHub's examples.
- `--no-ask-user` avoids CI hangs.
- `permissions` should be least privilege.

### `/delegate`, `--autopilot`, And `/fleet`

| Feature | Where work happens | Purpose |
|---|---|---|
| `--autopilot` | local CLI/runner | continue locally |
| `/delegate` or `& prompt` | Copilot cloud agent | background cloud task/PR |
| `/fleet` | CLI orchestration | split into parallel subagents |

Examples:

```text
/delegate fix failing tests and open a draft PR
```

```text
& investigate why deployment fails
```

```text
/fleet Review frontend, backend, and workflow tests. Split by area and summarize findings.
```

### Cloud-Agent Setup

Cloud-agent setup file:

```text
.github/workflows/copilot-setup-steps.yml
```

Required job name:

```yaml
jobs:
  copilot-setup-steps:
```

Example:

```yaml
name: Copilot Setup Steps

on:
  workflow_dispatch:

jobs:
  copilot-setup-steps:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
      - run: npm ci
```

Remember:

- Setup steps prepare the cloud-agent environment.
- They are not the same as an Actions workflow that runs `copilot -p`.
- File must be on the default branch.
- If setup fails, remaining setup steps are skipped and Copilot starts with current environment.

### Domain 2 Self-Check

- What is the required field in custom-agent YAML?
- What does `search` mean?
- Which tool allows sub-agent invocation?
- Where does `mcp-servers` go?
- What is the difference between `mcp-servers` and `mcpServers`?
- What file configures cloud-agent setup?
- Why use `--no-ask-user` in CI?
- What is the difference between `/delegate` and `/fleet`?

### Domain 2 Additional Traps

Tool traps:

- `search` means repository/file search, not web.
- `web` is not a replacement for `search`.
- `agent` is needed for custom-agent-to-custom-agent invocation.
- `edit` should be omitted for pure review.
- `execute` should be omitted if shell execution is not needed.
- `tools: ["*"]` is usually too broad unless the scenario explicitly says trusted or sandboxed.

MCP traps:

- `mcp-servers` is YAML inside agent frontmatter.
- `mcpServers` is JSON MCP config.
- `server/tool` exposes one tool.
- `server/*` exposes all tools on one server.
- Agents secrets/variables are not the same as Actions secrets.
- Firewall allowlist and MCP allowlist solve different problems.

CLI traps:

- `copilot -p` is noninteractive prompt mode.
- `--no-ask-user` matters in CI.
- `/delegate` hands work to cloud agent.
- `/fleet` splits work into subagents.
- `--autopilot` continues locally.

Cloud setup traps:

- `copilot-setup-steps.yml` must have job name `copilot-setup-steps`.
- Setup steps prepare the cloud-agent environment.
- A workflow that installs Copilot CLI and runs `copilot -p` is separate CI automation.

## 4. Domain 3: Manage Memory, State, And Execution

This domain is about continuity: what the agent knows now, what persists, what can be resumed, and how stale context is detected.

### Memory Types

| Type | Use |
|---|---|
| Short-term context | Current prompt/session |
| Copilot Memory | Reusable facts/preferences |
| Session state | Resumable agent execution |
| External durable state | PRs, issues, artifacts, logs, files, databases |

Use durable GitHub artifacts when state must be auditable:

- PR description.
- Issue comment.
- Workflow artifact.
- Session log.
- Commit.
- Check run.
- Audit log.

Do not store secrets in memory, prompts, instructions, or comments.

### Copilot Memory

Copilot Memory can store repository-level facts and user-level preferences.

Remember:

- Repository facts are scoped to repository.
- User preferences differ from repository facts.
- Repository facts should be checked against the current branch.
- Stale memory can cause wrong conventions.

### Copilot CLI Logs And Session State

Default root:

```text
~/.copilot/
```

Important paths:

| Path | Meaning |
|---|---|
| `~/.copilot/agents/` | user custom agents |
| `~/.copilot/config.json` | account/auth metadata |
| `~/.copilot/ide/` | IDE connection state |
| `~/.copilot/logs/` | process logs |
| `~/.copilot/logs/process-{timestamp}-{pid}.log` | one process log |
| `~/.copilot/mcp-config.json` | user MCP config |
| `~/.copilot/session-state/` | per-session state |
| `~/.copilot/session-state/<id>/events.jsonl` | session events |
| `~/.copilot/session-store.db` | indexed session database |
| `~/.copilot/settings.json` | user settings |

Environment overrides:

```text
COPILOT_HOME
COPILOT_CACHE_HOME
```

`COPILOT_HOME` changes config/state root. `COPILOT_CACHE_HOME` changes cache location.

### Reading CLI Logs

Checklist:

1. Count unique session IDs.
2. Check whether the same session ID is reused.
3. Look for `--resume`, `--continue`, `/resume`, or `resume=true`.
4. Look for `session-state/<id>/events.jsonl`.
5. Look for `Visual Studio Code connected` or `/ide`.
6. Look for MCP config load lines.
7. Look for disabling flags: `--disable-builtin-mcps`, `--disable-mcp-server`.
8. Look for tool calls: `read`, `search`, `edit`, `execute`, `jira/get_issue`.

Mock log:

```text
2026-05-24T08:31:03Z session.id=run-101 cwd=/work/repo
2026-05-24T08:31:04Z ide=Visual Studio Code connected
2026-05-24T08:31:05Z mcp loaded ~/.copilot/mcp-config.json servers=[github,jira]
2026-05-24T08:31:15Z tool=search args="refund"
2026-05-24T08:31:20Z tool=jira/get_issue args="PAY-144"
```

Interpretation:

- One session ID: `run-101`.
- VS Code/editor is connected.
- MCP is enabled with GitHub and Jira.
- Agent used repository search and an MCP tool.

Mock resume:

```text
session.id=run-101 resume=true
loaded ~/.copilot/session-state/run-101/events.jsonl
```

Interpretation:

- Existing session was resumed.

### SDK Session Persistence

TypeScript:

```ts
const client = new CopilotClient();
await client.start();

const session = await client.createSession({
  sessionId: "review-pr-42",
  model: "gpt-4.1",
});

await session.sendAndWait({ prompt: "Review this branch." });
await session.disconnect();

const resumed = await client.resumeSession("review-pr-42");
```

Python:

```python
from copilot import CopilotClient, PermissionHandler

client = CopilotClient()
await client.start()

session = await client.create_session(
    on_permission_request=PermissionHandler.approve_all,
    model="gpt-4.1",
)

response = await session.send_and_wait({"prompt": "Summarize this repo."})
print(response.data.content)

await client.stop()
```

Remember:

- A stable `sessionId` enables resume.
- Provider/API keys are not persisted.
- In-memory tool state is not persisted.
- `disconnect()` keeps session data.
- `deleteSession()` permanently deletes session data.

### Context Drift

Drift happens when the agent's assumptions diverge from reality.

Causes:

- Stale memory.
- Old instructions.
- Repository changed after task start.
- Multiple agents edited same files.
- Handoff artifact missing.
- Wrong session resumed.

Fixes:

- Re-read files.
- Check current branch/ref.
- Store handoff notes in PR/artifact.
- Update instructions or memory.
- Re-run tests/scans.
- Use branch isolation and concurrency.

### Domain 3 Scenario Patterns

New session:

```text
session.id=abc123
resume=false
```

Resumed session:

```text
session.id=abc123
loaded ~/.copilot/session-state/abc123/events.jsonl
resume=true
```

IDE attached:

```text
ide=Visual Studio Code connected
```

MCP enabled:

```text
mcp loaded ~/.copilot/mcp-config.json servers=[github,jira]
```

MCP disabled:

```text
argv=["copilot","--disable-builtin-mcps","-p","review"]
```

State storage choices:

| Need | Store in |
|---|---|
| Continue same SDK/CLI session | session ID/session-state |
| Share plan between workflow jobs | artifact or job output |
| Preserve review decision | PR comment/review |
| Preserve long-term repo convention | instructions or repository memory |
| Preserve audit trail | PR/session/workflow/audit logs |

Domain 3 traps:

- Memory is not secret storage.
- Session persistence is not the same as Copilot Memory.
- PR comments/artifacts are better than hidden session context when humans or other agents need the handoff.
- Stale memory should be verified against the current branch.

## 5. Domain 4: Evaluation, Error Analysis, And Tuning

Evaluation is evidence-based. The answer is usually in logs, scans, checks, artifacts, or review comments.

### Evaluation Signals

| Signal | What it proves |
|---|---|
| Tests | behavior still works |
| Lint/typecheck | code quality/compile correctness |
| CodeQL/code scanning | vulnerability detection |
| Secret scanning | leaked secret detection |
| Dependency review | dependency risk |
| Workflow logs | command and environment failures |
| Workflow artifacts | files/results produced by workflow |
| Session logs | what the agent did and why |
| PR comments | human/agent review trail |
| Audit logs | administrative/security events |

### Root Cause Table

| Symptom | Likely root cause | Fix |
|---|---|---|
| Agent edits wrong files | scope/tools too broad | narrow tools, path instructions |
| Agent cannot install dependencies | setup/environment missing | setup steps, package auth, runner fix |
| Agent cannot reach external service | MCP/secret/firewall issue | check MCP config, secret, firewall |
| Agent repeats work | missing durable state | session persistence or artifacts |
| Agent asks questions in CI | interactive prompt | add `--no-ask-user` |
| Agent uses stale style | stale instructions/memory | update instructions/memory |
| Agents conflict | shared branch/files | branch ownership, concurrency |
| Workflow blocked after Copilot push | approval needed | Approve and run workflows |
| Artifact missing | wrong path/retention/deletion | inspect artifact inputs/logs/audit |

### Tuning Levers

Tune instructions when:

- The style or convention is wrong.
- Agent repeatedly ignores local patterns.

Tune tools when:

- The agent lacks required capability.
- The agent has too much access.
- Wrong external tool is used.

Tune setup/environment when:

- Dependency install fails.
- Runner OS/toolchain is wrong.
- Firewall blocks needed access.

Tune workflow when:

- Validation is missing.
- Artifact output is missing.
- Runs overlap or cancel incorrectly.
- Human approval should happen earlier.

Tune memory/state when:

- Agent repeats work.
- Agent uses stale facts.
- Work must resume across sessions.

### Artifact And Audit Evaluation

Artifacts:

```yaml
- uses: actions/upload-artifact@v4
  with:
    name: review-output
    path: review.md
    retention-days: 7
    if-no-files-found: error
```

Download:

```yaml
- uses: actions/download-artifact@v4
  with:
    name: review-output
```

Inputs to remember:

| Input | Meaning |
|---|---|
| `name` | artifact name |
| `path` | files/directories/globs |
| `retention-days` | retention period |
| `if-no-files-found` | `warn`, `error`, `ignore` |
| `overwrite` | replace same-name artifact |
| `include-hidden-files` | include hidden files |

Manual artifact deletion is logged as:

```text
artifact.destroy
```

Where to find who deleted an artifact:

- Organization audit log or enterprise audit log.
- Filter/search event `artifact.destroy`.
- Use `actor`, `user`, `repo`, `created_at`, `@timestamp`, `operation_type`, `user_agent`.

Example:

```text
action=artifact.destroy actor=octocat repo=org/app created_at=2026-05-24T09:14:22Z
```

### Domain 4 Evaluation Examples

Workflow failure:

```text
npm ci
ERR! code E401
```

Likely issue:

- package registry authentication or missing secret.

Best tuning:

- fix setup steps, package auth, or secrets.
- do not grant broad shell access as the first fix.

Security scan failure:

```text
CodeQL detected: path traversal in upload handler
```

Best response:

- fix code.
- keep CodeQL/check as required.
- do not suppress the alert unless validated as a false positive.

Agent tool misuse:

```text
tool=execute command="git push origin main"
```

Best response:

- deny direct push with tool policy or hook.
- enforce branch protection/rulesets.
- instruct agent to open a PR instead.

Artifact missing:

```text
Warning: No files were found with the provided path: review.md
```

Best response:

- inspect artifact `path`.
- use `if-no-files-found: error` if missing artifact should fail.
- confirm the agent wrote the file before upload.

Tuning order:

1. Check prompt/task clarity.
2. Check instructions.
3. Check tool scope.
4. Check setup/environment.
5. Check current repo state.
6. Check memory/session state.
7. Check model choice last, unless docs explicitly point there.

## 6. Domain 5: Orchestrate Multi-Agent Coordination

This domain asks whether multiple agents can work safely without stepping on each other.

### When To Use Multiple Agents

Use multi-agent coordination when:

- Work splits cleanly by area.
- Agents have different expertise.
- Outputs can be merged/reviewed.
- Coordination cost is lower than doing it serially.

Avoid multi-agent coordination when:

- The task is inherently sequential.
- Agents must edit the same files.
- State handoff is unclear.
- Review/integration cost is high.

### Coordination Patterns

| Pattern | Use |
|---|---|
| Coordinator/worker | one agent plans/integrates, others do bounded tasks |
| Reviewer/verifier | one implements, another checks |
| Pipeline | plan -> implement -> review -> consolidate |
| Matrix | same job runs for multiple areas/agents |
| `/fleet` | CLI decomposes work into subagents |

### Agent Tool Handoff

Give an orchestrator the `agent` tool:

```yaml
tools:
  - read
  - search
  - agent
```

Then describe how to use specialists:

```markdown
Use reviewer for code quality.
Use auditor for compliance and traceability.
Consolidate both outputs.
```

### Actions Pipeline: Review, Audit, Consolidate

```yaml
name: Agent review pipeline

on:
  workflow_dispatch:
    inputs:
      task:
        required: true
        type: string

permissions:
  contents: read

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v4
      - run: npm install -g @github/copilot
      - env:
          COPILOT_GITHUB_TOKEN: ${{ secrets.PERSONAL_ACCESS_TOKEN }}
        run: |
          copilot --agent=reviewer -p "Review: ${{ inputs.task }}" --no-ask-user > review.md
      - uses: actions/upload-artifact@v4
        with:
          name: review-output
          path: review.md

  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v4
      - run: npm install -g @github/copilot
      - env:
          COPILOT_GITHUB_TOKEN: ${{ secrets.PERSONAL_ACCESS_TOKEN }}
        run: |
          copilot --agent=auditor -p "Audit: ${{ inputs.task }}" --no-ask-user > audit.md
      - uses: actions/upload-artifact@v4
        with:
          name: audit-output
          path: audit.md

  consolidate:
    needs: [review, audit]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: review-output
      - uses: actions/download-artifact@v4
        with:
          name: audit-output
      - run: |
          {
            echo "# Consolidated result"
            cat review.md
            cat audit.md
          } >> "$GITHUB_STEP_SUMMARY"
```

What to notice:

- `needs` orders jobs.
- Artifacts pass files.
- `$GITHUB_STEP_SUMMARY` creates readable output.

### Matrix Agents

```yaml
jobs:
  agent-check:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        agent: [reviewer, auditor]
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v4
      - run: npm install -g @github/copilot
      - env:
          COPILOT_GITHUB_TOKEN: ${{ secrets.PERSONAL_ACCESS_TOKEN }}
        run: |
          copilot --agent=${{ matrix.agent }} \
            -p "Analyze as ${{ matrix.agent }}" \
            --no-ask-user > "${{ matrix.agent }}.md"
      - uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.agent }}-output
          path: ${{ matrix.agent }}.md
```

Facts:

- `matrix.agent` is an array/list of agent names.
- `fail-fast: false` prevents one failed matrix job from canceling others.
- Matrix can generate up to 256 jobs per workflow run.

### Concurrency For Same PR Branch

Scenario: multiple agents commit to the same PR branch. Each commit triggers validation. Only the latest run matters.

Use workflow-level concurrency:

```yaml
name: Validate agent PR

on:
  pull_request:

concurrency:
  group: ${{ github.workflow }}-${{ github.head_ref || github.run_id }}
  cancel-in-progress: true

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - run: npm test
```

Why:

- Top-level `concurrency` applies to the whole workflow.
- `github.workflow` avoids canceling other workflows.
- `github.head_ref` groups by PR source branch.
- `github.run_id` is fallback if `head_ref` is unset.
- `cancel-in-progress: true` cancels stale runs.

If every run must happen in order:

```yaml
concurrency:
  group: production-agent-work
  queue: max
```

Do not combine `queue: max` with `cancel-in-progress: true`.

### Conflict Prevention

Use:

- Separate branches.
- Disjoint file ownership.
- `needs` for ordered work.
- Artifacts for handoff.
- Concurrency for overlap control.
- Required checks/reviews before merge.

Avoid:

- Agents editing same files at same time.
- Hidden handoffs only in chat memory.
- Shared mutable state without locking.
- Agents reverting each other's changes.

### Domain 5 Handoff Artifacts

Good handoff artifacts:

- `plan.md`
- `review.md`
- `audit.md`
- PR comment
- workflow artifact
- `$GITHUB_STEP_SUMMARY`
- issue checklist
- session link

Weak handoff:

```text
The first agent told the second agent in chat.
```

Better handoff:

```yaml
- uses: actions/upload-artifact@v4
  with:
    name: review-output
    path: review.md
```

then:

```yaml
- uses: actions/download-artifact@v4
  with:
    name: review-output
```

Same-branch risk:

- Multiple agents commit to the same PR branch.
- Each push triggers workflows.
- Older validation runs may become stale.

Best control when latest result is enough:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.head_ref || github.run_id }}
  cancel-in-progress: true
```

Best control when every run must happen:

```yaml
concurrency:
  group: production-agent-work
  queue: max
```

Do not combine `queue: max` with `cancel-in-progress: true`.

## 7. Domain 6: Implement Guardrails And Accountability

Guardrails keep agent autonomy safe.

### Control Types

| Type | Examples |
|---|---|
| Preventive | least-privilege tools, branch protection, rulesets, MCP allowlists, firewall, required reviews |
| Detective | session logs, workflow logs, artifacts, CodeQL, secret scanning, dependency review, audit logs |
| Corrective | revert PR, stop session, unassign/reassign Copilot, rotate secrets, remove MCP, narrow tools |

### GitHub Controls

Use GitHub as the control plane:

- Issues define work.
- Branches isolate changes.
- PRs review changes.
- Checks validate changes.
- Rulesets and branch protection gate merge.
- Environments gate deployments.
- Audit logs track administrative/security events.
- Session logs explain agent behavior.

### Workflow Approval After Copilot Pushes

If Copilot pushes workflow changes to a PR, workflows may not automatically run. The reviewer may need to select:

```text
Approve and run workflows
```

This is an accountability gate, not a build error.

### Stalled Agent Recovery

| Situation | Action |
|---|---|
| PR exists but no progress | Click **View session** |
| Copilot not responding to PR comment | Comment `@copilot` on open PR assigned to Copilot |
| User cannot trigger response | Confirm write access |
| Issue-assigned work stuck | Unassign issue, then reassign Copilot |
| Stuck replying to comment | Repeat the comment |
| Workflows not running after Copilot push | Approve and run workflows |

### Hooks

Two hook families:

| Family | Shape | Names |
|---|---|---|
| SDK hooks | code callbacks | `onPreToolUse`, `onPostToolUse` |
| CLI/cloud hooks | JSON files | `preToolUse`, `postToolUse` |

SDK example:

```ts
const session = await client.createSession({
  hooks: {
    onPreToolUse: async (input) => {
      if (input.toolName === "execute" && String(input.toolArgs?.command).includes("git push")) {
        return {
          permissionDecision: "deny",
          permissionDecisionReason: "Open a PR instead of pushing directly.",
        };
      }
      return { permissionDecision: "allow" };
    },
  },
});
```

CLI/cloud hook:

```json
{
  "version": 1,
  "hooks": {
    "preToolUse": [
      {
        "type": "command",
        "bash": "scripts/check-tool.sh",
        "timeoutSec": 30
      }
    ]
  }
}
```

Repository-level hook files live in `.github/hooks/*.json`. Copilot CLI can also load user hooks from `~/.copilot/hooks/` on macOS/Linux or `%USERPROFILE%\.copilot\hooks\` on Windows. Copilot cloud agent only gets the repository hooks from the cloned repo.

Hook entries can be command hooks, HTTP hooks, or prompt hooks. For command hooks, the important fields are:

| Field | Meaning |
|---|---|
| `type` | usually `"command"` |
| `bash` | Unix/Linux/macOS command |
| `powershell` | Windows PowerShell command |
| `command` | cross-platform fallback |
| `cwd` | working directory |
| `env` | environment variables for the hook |
| `timeoutSec` | timeout, default is 30 seconds |
| `matcher` | optional full-match regex for the event-specific value |

Cloud-agent hook environment:

- Cloud-agent hooks run in Linux.
- Cloud-agent working directory is `/workspace` when a repo is cloned.
- PowerShell-only hook entries are not enough for cloud agent.
- Only `bash` or `command` is useful for cloud agent command hooks.
- Cloud agent is non-interactive; an `"ask"` decision is treated like denial.
- Cloud agent does not load user-level hook files, local settings, or plugins.
- Hooks do not replace branch protection or required reviews.

High-yield hook events:

| Event | Fires when | Study note |
|---|---|---|
| `sessionStart` | new or resumed session begins | payload has `source`, such as `new` or `resume` |
| `sessionEnd` | session terminates | useful for cleanup/audit summaries |
| `userPromptSubmitted` | user prompt is submitted | cloud agent sees only the initial job prompt |
| `preToolUse` | before a tool executes | can allow, deny, ask, or modify args |
| `postToolUse` | after a successful tool | can add context or modify result |
| `postToolUseFailure` | after a failed tool | can provide recovery context |
| `agentStop` | main agent finishes a turn | can block and force another turn |
| `permissionRequest` | before CLI permission flow | CLI only; not for cloud-agent permissioning |
| `notification` | CLI notifications | CLI only; fire-and-forget |
| `subagentStart` | subagent starts | `matcher` filters by agent name |
| `subagentStop` | subagent completes | can block and force another turn |
| `errorOccurred` | agent/runtime error occurs | useful for diagnostics; does not approve/deny |

The hook input shape is important because it is what you must read when inspecting hook logs or configuration:

```json
{
  "sessionId": "s-123",
  "timestamp": 1779500000000,
  "cwd": "/workspace",
  "toolName": "bash",
  "toolArgs": "{\"command\":\"git push origin HEAD\"}"
}
```

In some references `toolArgs` is described as `unknown`; in CLI hook scripts it is commonly handled as a JSON string that must be parsed before reading fields such as `command`. If a payload uses PascalCase event names like `PreToolUse`, the compatible field names are snake_case, such as `tool_name` and `tool_input`.

For `preToolUse`, the hook controls execution by printing JSON to stdout:

```json
{
  "permissionDecision": "deny",
  "permissionDecisionReason": "Open a pull request instead of pushing directly."
}
```

Valid `preToolUse` decisions are:

| Value | Meaning |
|---|---|
| `"allow"` | tool executes |
| `"deny"` | tool is blocked; include `permissionDecisionReason` |
| `"ask"` | ask user in interactive CLI; treated as deny in cloud agent |

`permissionRequest` is different. It is CLI-only, runs before the CLI permission service, and uses:

```json
{
  "behavior": "deny",
  "message": "Do not run destructive shell commands.",
  "interrupt": true
}
```

Use `preToolUse` for cloud-agent permission decisions. Do not pick `permissionRequest` as the cloud-agent answer.

`matcher` filters hook invocations. The regex is anchored, so `"bash|powershell"` means exactly `bash` or `powershell`, not any string containing those words.

```json
{
  "version": 1,
  "hooks": {
    "preToolUse": [
      {
        "type": "command",
        "matcher": "bash|powershell",
        "bash": ".github/hooks/scripts/pre-tool-policy.sh",
        "powershell": ".github/hooks/scripts/pre-tool-policy.ps1",
        "timeoutSec": 30
      }
    ]
  }
}
```

Hook tool names are lower-level than the custom-agent `tools` list. Memorize this mapping:

| Hook `toolName` | Rough agent capability | Meaning |
|---|---|---|
| `view` | `read` | read file contents |
| `grep` | `search` | search file contents |
| `glob` | `search` | find files by pattern |
| `edit` | `edit` | modify existing files |
| `create` | `edit` | create files |
| `bash` | `execute` | run Unix shell commands |
| `powershell` | `execute` | run Windows PowerShell commands; not cloud agent |
| `task` | `agent` | run subagent tasks |
| `web_fetch` | `web` | fetch web pages |
| `ask_user` | user interaction | not useful in cloud agent |

What to notice in YAML, JSON, or log artifacts:

- If the hook is in `.github/hooks/*.json`, it can apply to both CLI and cloud agent.
- If it only has `powershell`, cloud agent will not use it because cloud agent is Linux.
- If the question asks to filter a hook to shell execution, use `matcher` against `toolName`, such as `"bash"` or `"bash|powershell"`.
- If the log says `toolName: "view"`, that is file reading. It is not a web/search tool.
- If the log says `toolName: "grep"` or `toolName: "glob"`, that is repository search, not internet browsing.
- If the hook returns empty output, default behavior continues.
- If any `preToolUse` hook returns `"deny"`, the tool is blocked.
- Hook failures usually fail open; use branch protection, required checks, and reviews for hard enforcement.

### Security Controls

Use:

- CodeQL/code scanning for code vulnerabilities.
- Secret scanning/push protection for secrets.
- Dependency review for dependency changes.
- Rulesets/branch protection for merge policy.
- Environment approvals for deployment.
- Audit logs for accountability.

### Auditability Evidence

Evidence includes:

- PR timeline.
- Session logs.
- Workflow logs.
- Workflow artifacts.
- Commit history.
- Check runs.
- Audit log events.

Artifact deletion:

```text
artifact.destroy
```

Look in organization/enterprise audit logs.

### Domain 6 Control Selection

Choose the control that enforces the outcome.

| Scenario | Better answer |
|---|---|
| prevent direct merge | branch protection or ruleset |
| require human deploy approval | environment required reviewer |
| prevent direct shell push | deny tool or pre-tool hook plus branch protection |
| detect hardcoded secret | secret scanning/push protection |
| detect vulnerable code | CodeQL/code scanning |
| review dependency changes | dependency review |
| restrict MCP servers | MCP registry/allowlist |
| restrict network egress | firewall allowlist |
| know who deleted artifact | audit log event `artifact.destroy` |
| know what agent did | session logs and PR timeline |

Policy versus guidance:

- Instructions guide model behavior.
- Tool lists limit capabilities.
- Hooks intercept behavior.
- Workflows validate behavior.
- Rulesets/branch protection enforce repository policy.
- Audit logs record accountability.

Use multiple layers for high-risk tasks.

## 8. Artifact Reading Labs

These labs are synthetic study examples based on official product behavior.

### Lab 1: Which Branch Is Checked Out?

```yaml
on:
  pull_request:

jobs:
  inspect:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          ref: ${{ github.head_ref }}
      - run: test -f .github/agents/reviewer.agent.md
```

Answer:

- Checks out the PR source branch.
- Checks whether the custom agent file exists on that branch.

### Lab 2: Which Runs Are Cancelled?

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.head_ref || github.run_id }}
  cancel-in-progress: true
```

Answer:

- New runs cancel older in-progress runs with the same workflow and PR branch/fallback group.

### Lab 3: What Can This Agent Do?

```yaml
tools:
  - read
  - search
  - agent
```

Answer:

- Read files.
- Search repository files/text.
- Invoke another custom agent.
- Cannot edit files unless `edit` is available.
- Cannot run shell commands unless `execute` is available.

### Lab 4: Where Does MCP Belong?

```markdown
---
name: triage
description: Triage external issue context
tools:
  - read
  - search
  - sentry/get_issue
mcp-servers:
  sentry:
    type: local
    command: npx
    args: ["-y", "sentry-mcp"]
    tools: ["get_issue"]
---
```

Answer:

- `mcp-servers` belongs in custom-agent YAML.
- `sentry/get_issue` exposes one MCP tool.

### Lab 5: Which Jobs Must Finish?

```yaml
jobs:
  review:
    runs-on: ubuntu-latest
  audit:
    runs-on: ubuntu-latest
  consolidate:
    needs: [review, audit]
    runs-on: ubuntu-latest
```

Answer:

- `consolidate` waits for `review` and `audit`.

### Lab 6: Who Deleted The Artifact?

```text
action=artifact.destroy actor=octocat repo=org/app created_at=2026-05-24T09:14:22Z
```

Answer:

- A workflow artifact was manually deleted.
- Actor is `octocat`.
- Timestamp is `2026-05-24T09:14:22Z`.

### Lab 7: New Session Or Resumed Session?

```text
session.id=abc123
loaded ~/.copilot/session-state/abc123/events.jsonl
resume=true
```

Answer:

- Existing session `abc123` was resumed.

### Lab 8: MCP Enabled Or Disabled?

```text
mcp loaded ~/.copilot/mcp-config.json servers=[github,jira]
```

Answer:

- MCP is enabled and loaded servers `github` and `jira`.

Counterexample:

```text
argv=["copilot","--disable-builtin-mcps","-p","review"]
```

Answer:

- Built-in MCP servers are disabled.

### Lab 9: Stalled Copilot PR

Scenario:

- PR has "Copilot started work."
- No new commits appear.

Answer:

- Click **View session**.
- If issue-assigned and stuck, unassign and reassign Copilot.
- If workflow approval is blocking, use **Approve and run workflows**.

## 9. Complete Self-Check

### Domain 1

- What makes a task suitable for an agent?
- What artifact proves the plan was reviewed?
- What blocks unreviewed merge?
- Why is an instruction not the same as a guardrail?

### Domain 2

- What is the required field in custom-agent YAML?
- What does `search` do?
- What does `agent` do?
- Where does `mcp-servers` go?
- What is the difference between `mcp-servers` and `mcpServers`?
- What file configures cloud-agent setup?
- Why use `--no-ask-user` in CI?
- What is the difference between `/delegate`, `/fleet`, and `--autopilot`?

### Domain 3

- Where do CLI logs live?
- Where does session state live?
- How do you identify a resumed session?
- What causes context drift?
- What should be stored as durable state?

### Domain 4

- Which evidence helps identify root cause?
- When should you tune instructions?
- When should you tune tools?
- When should you tune setup?
- What audit event records manual artifact deletion?

### Domain 5

- When should you use multiple agents?
- What does `needs` do?
- What does `matrix.agent` represent?
- When do you use workflow-level concurrency?
- What does `cancel-in-progress: true` do?

### Domain 6

- Which controls prevent unsafe merges?
- Which controls detect secrets?
- Which controls detect vulnerable code?
- Which logs prove what an agent did?
- How do you recover a stalled Copilot task?

## 10. High-Yield Reference Tables

### Files

| Path | Meaning |
|---|---|
| `.github/copilot-instructions.md` | repo instructions |
| `.github/instructions/*.instructions.md` | path instructions |
| `AGENTS.md` | agent instructions |
| `.github/prompts/*.prompt.md` | prompt templates |
| `.github/agents/*.agent.md` | custom agents |
| `.github/skills/<skill>/SKILL.md` | skills |
| `.github/hooks/*.json` | CLI/cloud hooks |
| `.github/workflows/copilot-setup-steps.yml` | cloud-agent setup |
| `.vscode/mcp.json` | VS Code MCP config |
| `.mcp.json` / `.github/mcp.json` | MCP config |
| `~/.copilot/mcp-config.json` | CLI MCP config |
| `~/.copilot/logs/` | CLI logs |
| `~/.copilot/session-state/` | session state |

### Commands And Slash Commands

| Item | Meaning |
|---|---|
| `copilot -p` | noninteractive prompt |
| `--agent=NAME` | use custom agent |
| `--allow-tool` | allow tool pattern |
| `--deny-tool` | deny tool pattern |
| `--no-ask-user` | no interactive questions |
| `--autopilot` | local autonomous continuation |
| `--resume` | resume named session |
| `--continue` | continue latest session |
| `/delegate` | hand off to cloud agent |
| `/fleet` | parallel subagent decomposition |
| `/session` | inspect current session |
| `/ide` | inspect IDE connection |
| `/mcp` | inspect MCP |

### Actions Keys

| Key | Meaning |
|---|---|
| `on.workflow_dispatch.inputs` | manual inputs |
| `on.workflow_call` | reusable workflow |
| `permissions` | `GITHUB_TOKEN` permissions |
| `jobs.<id>.needs` | dependency jobs |
| `jobs.<id>.outputs` | job outputs |
| `$GITHUB_OUTPUT` | step outputs |
| `$GITHUB_STEP_SUMMARY` | run summary |
| `strategy.matrix` | matrix jobs |
| `strategy.fail-fast` | matrix failure behavior |
| `concurrency.group` | concurrency identity |
| `cancel-in-progress` | cancel old run |
| `queue: max` | queue instead of cancel |

### Contexts

| Context | Meaning |
|---|---|
| `github.head_ref` | PR source branch |
| `github.base_ref` | PR target branch |
| `github.ref` | full ref |
| `github.ref_name` | short ref |
| `github.sha` | triggering commit |
| `github.run_id` | unique run ID |
| `github.run_number` | workflow run number |
| `github.run_attempt` | rerun attempt |
| `github.workflow` | workflow name |
| `github.actor` | original actor |
| `github.triggering_actor` | rerun actor |

### Audit/Event Terms

| Term | Meaning |
|---|---|
| `artifact.destroy` | workflow artifact manually deleted |
| `actor` | user/app that performed action |
| `created_at` / `@timestamp` | when event happened |
| `repo` / `repository` | affected repository |
| `operation_type` | type of audit operation |
| `user_agent` | client used |

## 11. Official Source Map

GH-600:

- https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/gh-600

Copilot cloud agent:

- https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent
- https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/troubleshoot-cloud-agent
- https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/manage-and-track-agents
- https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/customize-the-agent-environment
- https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/review-copilot-output

Copilot CLI:

- https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference
- https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference
- https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/delegate-tasks-to-cca
- https://docs.github.com/en/copilot/concepts/agents/copilot-cli/fleet
- https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/invoke-custom-agents
- https://docs.github.com/en/copilot/how-tos/copilot-cli/connecting-vs-code

Customization and custom agents:

- https://docs.github.com/en/copilot/reference/customization-cheat-sheet
- https://docs.github.com/en/copilot/reference/custom-agents-configuration
- https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills
- https://docs.github.com/en/copilot/concepts/agents/hooks
- https://docs.github.com/en/copilot/reference/hooks-reference
- https://docs.github.com/en/copilot/tutorials/copilot-cli-hooks

MCP:

- https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/extend-cloud-agent-with-mcp
- https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers
- https://docs.github.com/en/copilot/how-tos/copilot-sdk/use-copilot-sdk/mcp-servers
- https://docs.github.com/en/copilot/how-tos/administer-copilot/manage-mcp-usage/configure-mcp-server-access
- https://docs.github.com/en/copilot/reference/mcp-allowlist-enforcement

GitHub Actions:

- https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
- https://docs.github.com/en/actions/reference/workflows-and-actions/contexts
- https://docs.github.com/en/actions/reference/workflows-and-actions/expressions
- https://docs.github.com/en/actions/concepts/workflows-and-actions/concurrency
- https://docs.github.com/en/actions/concepts/workflows-and-actions/workflow-artifacts
- https://docs.github.com/en/actions/how-tos/manage-workflow-runs/remove-workflow-artifacts
- https://github.com/actions/checkout

Governance and security:

- https://docs.github.com/en/enterprise-cloud@latest/admin/monitoring-activity-in-your-enterprise/reviewing-audit-logs-for-your-enterprise/audit-log-events-for-your-enterprise
- https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets
- https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments
- https://docs.github.com/en/code-security/concepts/code-scanning/about-code-scanning
- https://docs.github.com/en/code-security/secret-scanning/about-secret-scanning
- https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/about-dependency-review