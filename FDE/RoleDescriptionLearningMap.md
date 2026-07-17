# Agentic Engineering Consultant Requirements-to-Learning Map

This document maps the requirements in [RoleDescription.md](./RoleDescription.md) to the GitHub Certified: Agentic AI Developer (GH-600) study guide, its Microsoft Learn modules, and supplemental official Microsoft Learn and GitHub documentation.

> **Reviewed:** July 16, 2026  
> **Primary credential:** [GitHub Certified: Agentic AI Developer](https://learn.microsoft.com/en-us/credentials/certifications/agentic-ai-developer/)  
> **Exam blueprint:** [Study guide for Exam GH-600: Developing in Agentic AI Systems](https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/gh-600)  
> **Important:** GH-600 is a strong technical match for the role's agentic-engineering requirements, but passing it does not establish Staff+ engineering depth, consulting skill, or delivery experience. Those gaps require hands-on evidence.

## Coverage legend

| Rating | Meaning |
| --- | --- |
| **Direct** | The material explicitly teaches or assesses the requirement. |
| **Partial** | The material supports part of the requirement; labs or experience are still needed. |
| **Experience** | Primarily demonstrated through prior work, a portfolio, simulation, or observed delivery—not a course or exam. |

## Core learning catalog

The short codes below are used throughout the mapping.

| Code | Official resource | Best use |
| --- | --- | --- |
| **GH600** | [GH-600 study guide](https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/gh-600) | Complete exam blueprint: architecture, tools, memory, evaluation, orchestration, and guardrails. |
| **FND** | [Foundations of Agentic AI in GitHub](https://learn.microsoft.com/en-us/training/modules/foundations-agentic-ai/) | Agentic SDLC, plan-act-evaluate lifecycle, GitHub as control plane, risks, traceability, and contributor model. |
| **ARCH** | [Designing Agent Architecture and SDLC Integration](https://learn.microsoft.com/en-us/training/modules/design-agent-architecture-integration/) | Task boundaries, structured plans, PR governance, GitHub Actions handoffs, observability, and reliability. |
| **TOOLS** | [Tooling, MCP, and Agent Execution Environments](https://learn.microsoft.com/en-us/training/modules/agent-tooling-mcp-execution-environments/) | Tools, MCP, Actions execution environments, scopes, limits, and safeguards. |
| **CUSTOM** | [Configure GitHub Copilot instructions and create custom agents](https://learn.microsoft.com/en-us/training/modules/configure-customize-github-copilot-visual-studio-code/) | Instruction files, prompt files, custom agents, tool permissions, and agent handoffs. |
| **COPILOT-1** | [GitHub Copilot Fundamentals Part 1 of 2](https://learn.microsoft.com/en-us/training/paths/copilot/) | Copilot across IDE, GitHub.com, and command line; responsible AI, prompting, management, and productivity. |
| **GH300** | [GH-300 GitHub Copilot study guide](https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/gh-300) | Broader Copilot feature, CLI, code review, policy, privacy, data-flow, and administration coverage. |
| **ACTIONS** | [Automate your workflow with GitHub Actions Part 1 of 2](https://learn.microsoft.com/en-us/training/paths/github-actions/) | CI workflows, secure deployment automation, GitHub Script, and API integration. |
| **CCR** | [Leveling up code reviews and pull requests with GitHub Copilot](https://learn.microsoft.com/en-us/training/modules/code-reviews-pull-requests-github-copilot/) | Copilot Code Review, custom instructions, rulesets, status checks, human review, and usage optimization. |
| **MAINT** | [Perform code maintenance tasks using GitHub Copilot Agent](https://learn.microsoft.com/en-us/training/paths/perform-code-maintenance-tasks-github-copilot-agent/) | Hands-on codebase work, refactoring, issue resolution, tests, and secret-scanning remediation. |
| **GHAS** | [GitHub Advanced Security Part 1 of 2](https://learn.microsoft.com/en-us/training/paths/github-advanced-security/) | CodeQL/code scanning, secret scanning, Dependabot, and secure SDLC controls. |
| **METRICS** | [GitHub Copilot usage metrics](https://docs.github.com/en/copilot/concepts/copilot-usage-metrics/copilot-metrics) | Adoption, engagement, acceptance, code generation, PR lifecycle, dashboard, API, and export metrics. |
| **ADOPT** | [Discover how to drive enablement of Microsoft 365 Copilot](https://learn.microsoft.com/en-us/training/paths/explore-how-drive-adoption-microsoft-copilot-m365/) | Supplemental, product-adjacent material for adoption planning, champions, communications, and behavior change. |
| **GITHUB** | [Microsoft Learn for GitHub](https://learn.microsoft.com/en-us/training/github/) | Gateway to GitHub Foundations, Actions, Advanced Security, Administration, and Copilot paths. |

## Tier 1: Non-negotiable on day one

### Software engineering depth

| Role requirement | Coverage | Recommended material | What the material provides / remaining gap |
| --- | --- | --- | --- |
| Polyglot engineering | **Experience** | MAINT; COPILOT-1 | Exercises build agent-assisted coding skill, but no learning path proves production depth across languages and frameworks. Validate with recent multi-language code samples and a live exercise. |
| Rapid codebase comprehension | **Partial** | MAINT; CUSTOM; COPILOT-1 | Teaches repository-aware exploration, refactoring, instructions, and agent use. Add a timed unfamiliar-repository assessment that ends with a correct architecture summary and proposed instructions. |
| Git and GitHub fluency | **Partial** | GITHUB; FND; ARCH | Covers repositories, branches, PRs, CODEOWNERS, rules, checks, and GitHub as control plane. Worktrees, merge-strategy tradeoffs, and advanced branch operations need hands-on validation. |
| CI/CD pipeline design | **Direct** | ACTIONS; ARCH; TOOLS | Covers GitHub Actions CI, triggers, contexts, outputs, cross-job handoffs, execution environments, and safe agent invocation. Add a lab that repairs and extends a real pipeline. |
| Enterprise infrastructure awareness | **Partial** | TOOLS; ARCH; [Copilot network settings](https://docs.github.com/en/copilot/concepts/network-settings) | Execution constraints, secrets, firewall/network boundaries, and environment safeguards are relevant; SSO, VPN, proxy, and enterprise network troubleshooting still require experience. |

### Customer-facing delivery

| Role requirement | Coverage | Recommended material | What the material provides / remaining gap |
| --- | --- | --- | --- |
| Hands-on embedded delivery | **Experience** | MAINT; CUSTOM; ACTIONS | Labs create technical practice only. Require evidence of pairing and shipping in a customer or cross-team codebase. |
| Time-boxed execution | **Experience** | ARCH; FND | Structured inputs, outputs, success criteria, and inspectable artifacts support delivery discipline. Validate with a two-week engagement plan and a timed capstone. |
| Technical and executive communication | **Experience** | FND; ADOPT | Supplies a common vocabulary for agentic SDLC, risk, value, and adoption. Assess with both a developer working session and a short executive readout. |
| Champion enablement | **Partial** | ADOPT; [Support champions in your organization](https://learn.microsoft.com/en-us/power-platform/guidance/adoption/champions) | Product-adjacent guidance covers champion roles and adoption mechanisms. Translate it into a GitHub Copilot champion charter, office hours, and succession plan. |
| Coaching and behavior change | **Partial** | ADOPT; COPILOT-1 | Covers responsible use, enablement, adoption planning, and common concerns, but facilitation skill must be observed. |
| Documentation that enables independence | **Partial** | ARCH; CUSTOM; FND | Emphasizes durable, inspectable artifacts and documented handoffs. Validate with repository guides that another engineer can follow without assistance. |

## Tier 2: Must demonstrate strong aptitude

### Context engineering

| Role requirement | Coverage | Recommended material | What to learn or produce |
| --- | --- | --- | --- |
| Custom-instructions architecture | **Direct** | CUSTOM; GH300; [Customize Copilot for a project](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-copilot-overview) | Design persistent repository guidance, path-specific instructions, prompt files, agent definitions, and scoped tool permissions. Produce a layered instruction decision record. |
| Repository configuration for agents | **Direct** | CUSTOM; ARCH; [Customize Copilot cloud agent](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/customize-the-agent-environment) | Configure `.github/copilot-instructions.md`, compatible `AGENTS.md` guidance, `.github/prompts/*.prompt.md`, custom agents, and `.github/workflows/copilot-setup-steps.yml`. Verify instructions are actually applied. |
| Issue decomposition for agents | **Direct** | GH600 Domain 1; ARCH; [Best practices for assigning tasks to Copilot](https://docs.github.com/en/copilot/using-github-copilot/coding-agent/best-practices-for-using-copilot-to-work-on-tasks) | Define inputs, outputs, constraints, success criteria, and review gates. Produce issues that an agent can complete without hidden assumptions. |
| MCP server identification and configuration | **Direct** | TOOLS; GH600 Domain 2; [Configure MCP servers for Copilot cloud agent](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/configure-mcp-servers) | Select high-value tools, add remote servers, configure registries/allow lists, scope credentials, and test failure modes. |
| Prompt-file libraries | **Direct** | CUSTOM; GH300; [Adding repository custom instructions](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions) | Create reusable task prompts with clear inputs, constraints, expected outputs, and references. Add versioning, ownership, and review guidance. |

### Agentic SDLC implementation

| Role requirement | Coverage | Recommended material | What to learn or produce |
| --- | --- | --- | --- |
| Copilot Coding Agent (CCA) | **Direct** | GH600; FND; ARCH; TOOLS; [About Copilot cloud agent](https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent) | Run issue-to-PR work, configure the environment and runners, inspect logs/artifacts, respond to CI, and demonstrate recovery/escalation. |
| Copilot Code Review (CCR) | **Direct** | CCR; GH300; [Using Copilot code review](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/copilot-code-review) | Configure automatic review, repository instructions, rulesets, and checks; measure suggestion usefulness and preserve human accountability. |
| Copilot CLI | **Direct** | GH300; COPILOT-1; [Copilot CLI quickstart](https://docs.github.com/en/copilot/how-tos/copilot-cli/cli-getting-started) | Use interactive sessions for shell/Git/repository work, restrict tools, manage context, delegate work, and roll back changes. |
| GitHub Copilot desktop app | **Partial** | [GitHub Copilot app quickstart](https://docs.github.com/en/copilot/how-tos/github-copilot-app/getting-started); GH300 | Learn agent sessions and issue/PR workflows in the app. Product-specific practice is required because GH-600 concentrates on platform-level agent operation. |
| Agentic orchestration patterns | **Direct** | GH600 Domains 3 and 5; CUSTOM; [Custom agents and sub-agent orchestration](https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/custom-agents) | Coordinate agents, isolate parallel execution, preserve state, resolve conflicts, record handoffs, and implement rollback/human-in-the-loop recovery. |

### Security, governance, and responsible AI

| Role requirement | Coverage | Recommended material | What to learn or produce |
| --- | --- | --- | --- |
| Agent permission scoping | **Direct** | GH600 Domains 2 and 6; TOOLS; [Customize the agent firewall](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/customize-the-agent-firewall) | Apply least privilege to tools, repositories, branches, workflows, MCP allow lists, credentials, and outbound network access. |
| Data-boundary awareness | **Direct** | GH300; COPILOT-1; [Content exclusion for GitHub Copilot](https://docs.github.com/en/copilot/concepts/context/content-exclusion) | Understand data flow, privacy/policy controls, exclusions, secrets boundaries, and documented feature limitations. Produce a data-flow/threat model. |
| Auditability | **Direct** | FND; ARCH; GH600 Domains 2, 5, and 6 | Preserve plans, logs, traces, workflow artifacts, commits, PR attribution, decisions, and approvals so agent actions are reviewable. |
| Branch rulesets and governance | **Direct** | ARCH; CCR; FND | Enforce PRs, required reviews/status checks, CODEOWNERS, environments, and human approval for sensitive or irreversible changes. |

### Measurement and adoption metrics

| Role requirement | Coverage | Recommended material | What to learn or produce |
| --- | --- | --- | --- |
| Capability assessment (L1-L5) | **Partial** | ADOPT; FND; METRICS | No cited course defines the role's custom L1-L5 model. Use the role's definitions to build a rubric grounded in workflow, governance, adoption, and outcome evidence. |
| Baseline and post-engagement measurement | **Partial** | METRICS; ADOPT | Establish a dated baseline, define a comparison window and confounders, and repeat the same measures at handoff. Technical metrics alone do not establish causality. |
| Agentic adoption metrics | **Direct** | METRICS; [Copilot usage metrics API reference](https://docs.github.com/en/copilot/reference/copilot-usage-metrics) | Use adoption/engagement, agent mode, code review, code generation, PR creation/merge, and time-to-merge metrics. Supplement gaps such as CCA merge rate or CI pass rate with GitHub API/Actions data. |
| Signal capture | **Partial** | METRICS; ADOPT; GH600 Domain 4 | Combine quantitative telemetry with developer sentiment, failure classification, blockers, qualitative observations, and recommended actions in a reusable engagement report. |

## Tier 3: Can be trained or certified

| Role requirement | Coverage | Recommended material | Suggested evidence |
| --- | --- | --- | --- |
| GitHub Enterprise Cloud administration | **Partial** | GITHUB (GitHub Administration); GH300; COPILOT-1 | Configure a sandbox organization: policies, seats, feature access, content exclusions, and audit-log review. |
| Advanced CCA and CCR configuration | **Direct** | GH600; ARCH; TOOLS; CCR | Demonstrate a governed issue-to-PR-to-review flow with custom instructions, CI feedback, and recovery. |
| MCP implementation and ecosystem | **Direct** | TOOLS; GH600; [MCP and Copilot cloud agent](https://docs.github.com/en/copilot/concepts/agents/coding-agent/mcp-and-coding-agent) | Connect at least two servers, document trust boundaries, use allow lists, rotate credentials, and test unavailable/unsafe tool behavior. |
| GitHub Advanced Security integration | **Direct** | GHAS; MAINT | Configure CodeQL/code scanning, secret scanning, and Dependabot; feed results into PR and agent evaluation loops. |
| Copilot Metrics API | **Direct** | METRICS; [REST API endpoints for Copilot metrics](https://docs.github.com/en/rest/copilot/copilot-metrics) | Build a small export/report and explain retention, telemetry, scope, attribution, and interpretation limitations. |
| AI credit economics and optimization | **Partial** | CCR; [Models and pricing for GitHub Copilot](https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing); [Budgets for usage-based billing](https://docs.github.com/en/copilot/concepts/billing/budgets-for-usage-based-billing) | Compare model/token costs, code-review/Actions consumption, pooled allowances, budgets, and workload routing; revisit because billing changes frequently. |

## Nice-to-have differentiators

| Differentiator | Coverage | Recommended material / validation |
| --- | --- | --- |
| Consulting or partner delivery | **Experience** | Validate ambiguity management, discovery, expectation setting, travel/customer constraints, and multiple-client delivery through examples and references. |
| AI developer tools beyond Copilot | **Experience** | GH-600 is vendor-specific. Require a comparative exercise across at least two other tools covering context, autonomy, security, extensibility, and cost. |
| Enterprise DevSecOps toolchains | **Direct** | GHAS; ACTIONS; MAINT. |
| Developer enablement at scale | **Partial** | ADOPT plus evidence of workshops, office hours, communities of practice, reusable curriculum, and measured follow-through. |
| GitHub Advanced Security knowledge | **Direct** | GHAS plus a working repository demonstration. |
| LLM fundamentals | **Partial** | COPILOT-1 responsible AI and prompt engineering; [Generative AI for beginners](https://learn.microsoft.com/en-us/training/paths/introduction-generative-ai/) for models, tokens, grounding, and responsible use. Deep model evaluation still needs additional practice. |
| GitHub Actions authoring and automation | **Direct** | ACTIONS; ARCH; TOOLS. |
| Regulated-industry experience | **Experience** | GH600 guardrails provide a technical base, but industry-specific compliance judgment must be demonstrated from relevant work or scenario-based assessment. |

## Experience bar

| Requirement | Learning contribution | How to validate |
| --- | --- | --- |
| 5+ years shipping production software | Courses can refresh skills but cannot substitute. | Employment/project history, production artifacts, architecture decisions, incident/debugging examples, and live coding. |
| 2+ years customer-facing technical work | ADOPT supplies useful frameworks but cannot substitute. | Customer examples, references, facilitation simulation, conflict handling, and executive/developer communication. |
| 1+ year hands-on AI developer tooling with delivery impact | GH600, CUSTOM, MAINT, and METRICS provide strong preparation. | Portfolio showing workflows—not autocomplete demos—with before/after engineering outcomes and clear attribution limits. |
| Impact in unfamiliar, time-constrained environments | ARCH supports structured execution. | Timed unfamiliar-repository capstone with a written entry plan, checkpoints, shipped change, and handoff. |

## Capstone mapped to successful-engagement deliverables

Completing the courses should be followed by a single integrated capstone. Use a realistic repository and require the following evidence:

| Role deliverable | Capstone evidence | Primary preparation |
| --- | --- | --- |
| Repository configured for agents | Working `copilot-instructions.md`, `AGENTS.md`, `copilot-setup-steps.yml`, path-specific instructions, and a prompt library; include tests showing instructions are effective. | CUSTOM; ARCH; TOOLS |
| Working CCA issue-to-PR flow | A structured issue, agent plan, agent-authored branch/PR, CI feedback, correction, and human approval. | GH600; ARCH; TOOLS |
| CCR with team guidelines | Automatic review configured through rules/policies and grounded in repository-specific standards; sample accepted and rejected suggestions. | CCR; GH300 |
| Two enterprise-specific MCP integrations | Two least-privilege servers with allow lists, credential handling, failure tests, and a data-boundary diagram. | TOOLS; GH600 Domains 2 and 6 |
| Tailored Agentic SDLC playbook | Discover/define/deliver workflow, task-selection rules, autonomy levels, escalation paths, anti-patterns, and RACI. | FND; ARCH; GH600 |
| Metrics baseline and post-engagement change | Reproducible dashboard/export plus repository/Actions measures and developer sentiment; disclose metric limitations. | METRICS; GH600 Domain 4 |
| Internal champions enabled | Champion charter, selection criteria, train-the-trainer session, office-hours plan, and ownership after handoff. | ADOPT |
| Independent handoff documentation | Operator guide, troubleshooting/recovery runbook, architecture and security decisions, owners, and a follow-up validation checklist. | ARCH; GH600 Domains 3 and 5 |

## Recommended study sequence

1. **Establish the model:** FND, then read the complete GH600 blueprint.
2. **Design governed workflows:** ARCH and ACTIONS.
3. **Configure context and agents:** CUSTOM, followed by a repository customization lab.
4. **Connect tools safely:** TOOLS, including two MCP integrations and firewall/permission exercises.
5. **Practice product workflows:** MAINT, CCR, Copilot CLI, and a complete CCA issue-to-PR flow.
6. **Evaluate and govern:** GH600 Domains 3-6, GHAS, content exclusion, auditability, and failure recovery.
7. **Measure and enable:** METRICS and the relevant portions of ADOPT.
8. **Prove the role—not just the exam:** complete the integrated capstone and separately assess the experience-only requirements.

## Bottom line

GH-600 is the best single certification match for the role because its six domains directly address production agent workflows, tool/MCP integration, memory and state, evaluation, multi-agent orchestration, and guardrails. The largest gaps are deliberate: polyglot Staff+ engineering depth, embedded consulting delivery, coaching, executive communication, time-boxed transformation, and the role-specific L1-L5 maturity model. Treat GH-600 as the technical spine of the preparation plan, then use the supplemental material and capstone above to cover product breadth and applied delivery.
