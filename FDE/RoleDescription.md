> **Source:** GitHub FDE JD  
> **From:** Andrew Herman  
> **Recipients:** Mojdeh Morgan and Linda Truong  
> **Note:** FYI—this is their internal hiring job description.

---

# Agentic Engineering Consultant — Skills and Requirements Checklist

> **Purpose:** Hiring criteria for Accenture to use when sourcing and evaluating consultants who will be deployed to GitHub customers to drive agentic engineering adoption and AI Native transformation using GitHub Copilot.

---

## TL;DR

Hire Staff+ engineers who can enter an unfamiliar enterprise environment and codebase, configure GitHub Copilot agents safely, teach teams how to delegate work to AI agents, share best practices in context engineering, and leave behind repeatable workflows that improve software and product delivery throughput and quality. These are hands-on engineers who pair and ship—not strategy consultants who present.

---

## Glossary

| Term | What It Means |
| --- | --- |
| **AI Native** | An engineering organization that operates with AI as a first-class participant across every stage of software delivery |
| **Agentic Engineering** | The engineering culture and tooling environment in which teams routinely delegate well-scoped work to AI agents |
| **Agentic SDLC** | The restructuring of each phase of the software development lifecycle—discover, define, and deliver—to leverage AI agents |
| **CCA (Copilot Coding Agent)** | GitHub's coding agent, which can read a GitHub issue, plan the work, write code, run tests, self-correct through CI, and open a pull request |
| **CCR (Copilot Code Review)** | GitHub Copilot's automated code review capability, which runs on pull requests and follows custom coding guidelines |
| **MCP (Model Context Protocol)** | An open standard that connects AI agents to external tools, databases, APIs, and documentation |
| **Context Engineering** | The practice of providing AI agents with the right information—such as instructions, repository configuration, and MCP connections—to produce high-quality, team-aligned output |
| **Custom Instructions** | Markdown files, such as `.github/copilot-instructions.md`, `AGENTS.md`, and prompt files, that tell AI agents how to behave in a specific repository |
| **Capability Model (L1–L5)** | A maturity scale ranging from L1 (Aware—seats are provisioned but unused) to L5 (Transforming—AI has fundamentally changed how the organization builds software) |

---

## Role Context

These consultants are **embedded engineers**, not advisors. They work directly in customer codebases, pair with engineering teams, and configure agentic workflows hands-on. Their mission is to help enterprises transition from traditional software development to an **Agentic SDLC** powered by GitHub Copilot, ultimately making the customer's engineering organization **AI Native**.

**The three-level framework:**

| Level | What It Means | Consultant's Focus |
| --- | --- | --- |
| **AI Native** | The north star: the customer's engineering organization operates with AI as a first-class participant in every stage of the SDLC | Articulate the vision and define the destination |
| **Agentic Engineering** | The convergence of culture and technology: teams work agentically and delegate well-scoped work to AI agents as a standard practice | Build the engineering culture and configure the platform |
| **Agentic SDLC** | The specific workflow changes: each phase—Discover, Define, and Deliver—is restructured to leverage agents | Implement agentic practices hands-on across each SDLC phase |

---

## Skill Tiers

Skills are grouped into three tiers:

1. **Non-Negotiable on Day One** — Candidates must already possess these skills; they cannot reasonably be developed during a short ramp-up period.
2. **Must Demonstrate Strong Aptitude** — Candidates may not have deep GitHub-specific experience, but they must demonstrate transferable ability and the potential to ramp quickly.
3. **Can Be Trained or Certified** — GitHub and its partners will provide enablement. Aptitude matters more than existing product-specific knowledge.

---

## Tier 1: Non-Negotiable on Day One

### Software Engineering Depth

- [ ] **Polyglot engineering** — Strong across multiple programming languages and frameworks, because agent enablement spans whatever technology stack the customer uses
- [ ] **Rapid codebase comprehension** — Able to read and understand unfamiliar codebases quickly enough to configure agents and write effective custom instructions within days, not weeks
- [ ] **Git and GitHub fluency** — Understands branching strategies, pull-request workflows, merge strategies, branch-protection rules, worktrees, and GitHub-native development practices
- [ ] **CI/CD pipeline design** — Able to read, modify, and design CI/CD pipelines—preferably with GitHub Actions—that provide structured output for both humans and agents
- [ ] **Enterprise infrastructure awareness** — Experienced with proxies, SSO, VPNs, firewalls, and network constraints common in large enterprise environments

### Customer-Facing Delivery

- [ ] **Hands-on embedded delivery** — Writes code, configures systems, and pairs with customer engineers on real tasks; credibility comes from technical depth, not slide decks
- [ ] **Time-boxed execution** — Delivers measurable outcomes within 2–4-week engagements, with clear entry and exit criteria and complete handoff documentation
- [ ] **Technical and executive communication** — Explains agentic engineering concepts effectively to both hands-on developers and VP- and CTO-level stakeholders
- [ ] **Champion enablement** — Identifies and develops internal customer champions who can sustain adoption after the engagement ends
- [ ] **Coaching and behavior change** — Runs working sessions, coaches skeptical senior engineers, and addresses resistance related to code quality, job anxiety, trust, and governance
- [ ] **Documentation that enables independence** — Leaves behind configurations, guides, and patterns that make the customer self-sufficient

---

## Tier 2: Must Demonstrate Strong Aptitude

### Context Engineering

Context engineering is the single most important agentic skill. It is the practice of providing AI agents with the right information at the right time so they can produce high-quality, team-aligned output.

- [ ] **Custom-instructions architecture** — Designs and implements multilayered instruction hierarchies—from organization-level guidance to repository-level instructions and prompt files—that shape AI behavior to match team conventions
- [ ] **Repository configuration for agents** — Knows how to configure `.github/copilot-instructions.md`, `AGENTS.md`, `.github/prompts/*.prompt.md`, and `copilot-setup-steps.yml` so AI agents operate like team members who have read the contributor guide
- [ ] **Issue decomposition for agents** — Writes, and teaches others to write, well-scoped GitHub issues with structured context, acceptance criteria, and constraints that agents can execute independently
- [ ] **MCP server identification and configuration** — Identifies high-value enterprise integrations, such as databases, internal documentation, CI/CD systems, and ticketing platforms, and configures MCP servers to provide agents with enterprise-specific context
- [ ] **Prompt-file libraries** — Creates reusable prompt files for common team workflows, such as bug triage, migrations, test scaffolding, and component generation, to standardize how the team interacts with AI

### Agentic SDLC Implementation

- [ ] **Copilot Coding Agent (CCA)** — Has deep, hands-on experience configuring and using CCA, including issue-to-PR workflows, CI feedback loops, self-correction patterns, and GitHub-hosted and self-hosted runner configuration
- [ ] **Copilot Code Review (CCR)** — Configures CCR as an automatic reviewer with custom coding guidelines that reflect the team's actual standards rather than generic boilerplate
- [ ] **Copilot CLI** — Is proficient with Copilot in the terminal and can enable teams to use it for shell commands, Git operations, and codebase exploration
- [ ] **GitHub Copilot desktop app** — Has experience using GitHub Copilot from a desktop application and can explain how it can help scale agentic workflows
- [ ] **Agentic orchestration patterns** — Chains CCA, MCP, and custom instructions into integrated workflows in which an agent reads an issue, gathers context from enterprise systems through MCP, generates code that follows custom instructions, and validates the result through CI

### Security, Governance, and Responsible AI

- [ ] **Agent permission scoping** — Understands least-privilege principles for agent tool access and can configure agent firewalls to restrict outbound network access
- [ ] **Data-boundary awareness** — Understands what data agents can access, where that data flows, and how to prevent sensitive-data exposure through AI tools
- [ ] **Auditability** — Demonstrates how agent actions are logged, traceable, and reviewable through mechanisms such as agent-authored pull requests, commit attribution, and CI audit trails
- [ ] **Branch rulesets and governance** — Designs pull-request governance that applies the same rigor to agent-authored code as to human-authored code, including required reviews, status checks, and `CODEOWNERS`

### Measurement and Adoption Metrics

- [ ] **Capability assessment** — Assesses a customer's current agentic maturity from L1 to L5 and designs a prioritized plan for advancing it
- [ ] **Baseline and post-engagement measurement** — Establishes pre-engagement metrics and measures the change at wrap-up to demonstrate transformation
- [ ] **Agentic adoption metrics** — Tracks and interprets agent-authored pull requests, CCA merge rate, agent-review acceptance, CI pass rate, time from assignment to merge, and developer sentiment
- [ ] **Signal capture** — Identifies and communicates adoption signals, blockers, and patterns across engagements in a structured format for account teams and leadership

---

## Tier 3: Can Be Trained or Certified

These GitHub-specific product details can be taught through enablement programs. Candidates should demonstrate aptitude and learning velocity, but they are not expected to know these details on day one.

- [ ] GitHub Enterprise Cloud administration, including organization settings, Copilot policies, seat management, and content exclusions
- [ ] Specific CCA and CCR configuration nuances and advanced patterns
- [ ] MCP server implementation details and familiarity with the MCP server ecosystem
- [ ] GitHub Advanced Security integration patterns, including CodeQL, secret scanning, and Dependabot
- [ ] Copilot Metrics API usage for adoption measurement and reporting
- [ ] AI credit economics and optimization strategies

---

## Nice-to-Have Differentiators

- [ ] Prior consulting or partner-delivery experience, including comfort with ambiguity, multiple clients, and travel
- [ ] Experience with AI/ML developer tools beyond Copilot and an understanding of the competitive landscape, including Cursor, Windsurf, and Anthropic Claude Code
- [ ] Familiarity with enterprise DevSecOps toolchains, including CodeQL, secret scanning, Dependabot, and GitHub Advanced Security
- [ ] Experience running developer-enablement programs at scale, such as workshops, office hours, and internal communities of practice
- [ ] GitHub Advanced Security knowledge that complements agentic workflows with automated security
- [ ] Understanding of LLM fundamentals, including model selection, token economics, and prompt-engineering principles—not ML engineering, but enough to explain *why* context engineering matters
- [ ] Experience authoring GitHub Actions workflows and designing automation
- [ ] Experience in regulated industries, such as financial services, healthcare, or government, where compliance intersects with AI adoption

---

## Anti-Patterns: What This Role Is Not

| This Role Is Not... | Why |
| --- | --- |
| Staff augmentation | Consultants drive transformation toward a specific destination—AI Native—rather than performing open-ended backlog work |
| Slide-deck consulting | Value is delivered through code, configuration, and pairing, not presentations |
| Generic DevOps or platform engineering | The focus is specifically on agentic engineering adoption, not general infrastructure |
| Sales engineering | The goal is capability progression, not deal closure; revenue follows adoption |
| AI/ML data science | The role focuses on AI-powered *development workflows*, not building ML models |
| Support or troubleshooting | Consultants configure and enable; they do not operate ongoing triage queues |

---

## Evaluation Criteria

When interviewing candidates, assess the following:

1. **Can they demonstrate context engineering?** Ask candidates to design a custom-instructions strategy for a hypothetical enterprise repository. Do they think in layers—from organization to repository to prompt file? Do they consider what an agent needs to succeed?

2. **Can they decompose work for agents?** Give candidates a feature request and ask them to write an issue that an AI agent could execute. Look for structured context, clear acceptance criteria, and explicit scope boundaries.

3. **Do they think in systems, not features?** The best consultants understand how CCA, CCR, MCP, and custom instructions work together as an integrated system. Ask candidates about orchestration patterns.

4. **Are they engineers first?** Ask about code they have written recently. This role requires people who code daily, not people who used to code.

5. **Can they teach and leave behind lasting capability?** Ask how they would ensure that a customer team continues operating agentically after the engagement ends. Look for champion development, documentation, and cultural-change strategies.

---

## Experience Bar

- **5+ years** of software engineering experience shipping production software
- **2+ years** in a customer-facing technical role, such as consulting, solutions engineering, developer advocacy, or prior FDE-equivalent work
- **1+ year** of hands-on experience with AI-powered development tools, with **demonstrable delivery impact using agentic workflows**, not merely autocomplete or chat usage; candidates should be able to show examples of AI-assisted workflows that improved real engineering outcomes
- **Demonstrated ability** to work while embedded in unfamiliar environments and deliver impact under time constraints

---

## What a Successful Engagement Leaves Behind

A successful consultant delivers the following during each engagement:

- [ ] A repository configured for Copilot agents, including `copilot-instructions.md`, `AGENTS.md`, `copilot-setup-steps.yml`, and a prompt library
- [ ] A working CCA issue-to-PR flow demonstrated on real customer work
- [ ] CCR configured with the team's actual coding guidelines
- [ ] At least two MCP integrations connecting Copilot to enterprise-specific systems
- [ ] An Agentic SDLC playbook tailored to the customer's workflow
- [ ] An adoption-metrics baseline and a documented post-engagement change
- [ ] Internal champions identified and enabled to sustain the practices
- [ ] Handoff documentation that enables the customer to operate independently