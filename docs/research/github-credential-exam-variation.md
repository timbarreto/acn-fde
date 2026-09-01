# What varies across GitHub credential exams

Captured 2026-09-01 from Microsoft Learn and GitHub first-party pages only.
This answers [Capture what varies across GitHub credential exams](https://github.com/timbarreto/acn-fde/issues/122): what a general practice architecture must leave open rather than freezing as a GH-600 or GH-300 accident.

## Authority

| Claim | Owner | URL |
| --- | --- | --- |
| GH-900 credential, duration, languages, practice assessment | GitHub Foundations | https://learn.microsoft.com/en-us/credentials/certifications/github-foundations/ |
| GH-900 skills measured | Exam GH-900 study guide | https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/gh-900 |
| GH-200 credential | GitHub Actions | https://learn.microsoft.com/en-us/credentials/certifications/github-actions/ |
| GH-200 skills measured | Exam GH-200 study guide | https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/gh-200 |
| GH-300 credential | GitHub Copilot | https://learn.microsoft.com/en-us/credentials/certifications/github-copilot/ |
| GH-300 skills measured | Exam GH-300 study guide | https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/gh-300 |
| GH-500 credential | GitHub Advanced Security | https://learn.microsoft.com/en-us/credentials/certifications/github-advanced-security/ |
| GH-500 skills measured | Exam GH-500 study guide | https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/gh-500 |
| GH-100 credential | GitHub Administration | https://learn.microsoft.com/en-us/credentials/certifications/github-administration/ |
| GH-100 skills measured | Exam GH-100 study guide | https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/gh-100 |
| GH-600 credential | GitHub Certified: Agentic AI Developer | https://learn.microsoft.com/en-us/credentials/certifications/agentic-ai-developer/ |
| GH-600 skills measured | Exam GH-600 study guide | https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/gh-600 |
| Passing score 700 / 1000 | Exam scoring and score reports | https://learn.microsoft.com/en-us/credentials/certifications/exam-scoring-reports |
| Duration bands, labs unpublished, no Learn on GitHub exams | Exam duration and exam experience | https://learn.microsoft.com/en-us/credentials/support/exam-duration-exam-experience |
| Pearson VUE delivery | Registering for a GitHub Certifications exam | https://docs.github.com/en/get-started/showcase-your-expertise-with-github-certifications/registering-for-a-github-certifications-exam |
| GitHub Docs catalog (omits GH-600) | About GitHub Certifications | https://docs.github.com/en/get-started/showcase-your-expertise-with-github-certifications/about-github-certifications |

Do not treat blogs, third-party prep sites, or GitHub user repos as catalog owners.

## Official catalog (six current GitHub credentials)

| Exam | Credential title (Learn) | Study-guide exam title | Level | Duration | Languages | Official Learn practice assessment | Domain count |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GH-900 | GitHub Foundations | Exam GH-900: GitHub Foundations | Beginner | 100 min | English, Spanish, Portuguese (Brazil), Korean, Japanese | Yes (`practiceAssessmentUid: 954809103`) | 7 |
| GH-200 | GitHub Actions | Exam GH-200: GitHub Actions | Intermediate | 100 min | same five | Yes (`1001`) | 5 |
| GH-300 | GitHub Copilot | Exam GH-300: GitHub Copilot | Intermediate | 100 min | same five | Yes (`218035372`) | 6 unique skill areas (Learn also lists a duplicate 7th title) |
| GH-500 | GitHub Advanced Security | Exam GH-500: GitHub Advanced Security | Intermediate | 100 min | same five | Yes (`590484996`) | 6 |
| GH-100 | GitHub Administration | Exam GH-100: GitHub Enterprise Administrator | Intermediate | 100 min | English only | Yes (`1841205577`) | 5 |
| GH-600 | GitHub Certified: Agentic AI Developer | Exam GH-600: Developing in Agentic AI Systems | Intermediate | **120 min** | English only | **No** | 6 |

GitHub Docs lists Foundations, Actions, Advanced Security, Administration, and Copilot — **not** Agentic AI Developer. Architecture cannot assume one official index is complete.

## Per-exam skills measured

### GH-900 — GitHub Foundations (as of January 2026)

- Understand Git and GitHub basics (25–30%)
- Work with GitHub repositories (10–15%)
- Collaborate using GitHub (10–15%)
- Apply modern development practices (10–15%)
- Manage projects with GitHub (5–10%)
- Understand privacy, security, and administration (10–15%)
- Explore the GitHub community (5–10%)

Beginner, but **100 minutes**, not the 45-minute Microsoft Fundamentals duration.

### GH-200 — GitHub Actions (as of January 2026)

- Author and manage workflows (20–25%)
- Consume and troubleshoot workflows (15–20%)
- Author and maintain actions (15–20%)
- Manage GitHub Actions for the enterprise (20–25%)
- Secure and optimize automation (10–15%)

### GH-300 — GitHub Copilot (skills as of August 7, 2026)

Six detailed skill areas:

- Use GitHub Copilot responsibly (15–20%)
- Use GitHub Copilot features (25–30%)
- Understand GitHub Copilot data and architecture (10–15%)
- Apply prompt engineering and context crafting (10–15%)
- Improve developer productivity with GitHub Copilot (10–15%)
- Configure privacy, content exclusions, and safeguards (10–15%)

The study-guide “Skills at a glance” and credential “Assessed on this exam” lists also include a seventh title **GitHub Copilot features (25–30%)** with no matching detailed section. Treat domain count as **six unique areas**. Full nested objectives: `docs/research/gh-300-published-catalog.md` on `research/gh-300-published-catalog`.

### GH-500 — GitHub Advanced Security (as of July 2026)

1. Describe GitHub Security Suites, Features, and Ecosystem (15–20%)
2. Configure and Use Secret Protection (formerly secret scanning) (15–20%)
3. Configure and Use Supply Chain Security (formerly Dependabot/Dependency Review) (15–20%)
4. Configure and Use Code Security (formerly Code Scanning with CodeQL) (10–15%)
5. Security Operations: Best Practices, Prioritization, and Remediation (15–20%)
6. GitHub Security Suites Administration (10–15%)

### GH-100 — GitHub Administration / GitHub Enterprise Administrator (as of July 2026)

**Title split is real:** Learn credential = “GitHub Administration”; study guide = “GitHub Enterprise Administrator”.

1. Manage GitHub Identities and Access (15–20%)
2. Administer GitHub Enterprise Environment (10–15%)
3. Implement Secure Software Development and Compliance (25–30%)
4. Manage GitHub Actions (20–25%)
5. Monitor and Optimize GitHub Usage (10–15%)

English only.

### GH-600 — GitHub Certified: Agentic AI Developer

**Title split is real:** credential = “GitHub Certified: Agentic AI Developer”; exam/study guide = “Developing in Agentic AI Systems”. Duration **120 minutes**. English only. No Learn practice-assessment section. Skills-measured block has **no “as of &lt;date&gt;”**.

1. Prepare agent architecture and SDLC processes (15–20%)
2. Implement Tool Use and Environment Interaction (20–25%)
3. Manage Memory, State, and Execution (10–15%)
4. Perform Evaluation, Error Analysis, and Tuning (15–20%)
5. Orchestrate Multi-Agent Coordination (15–20%)
6. Implement Guardrails and Accountability (10–15%)

Beta status is **unpublished** on the current Learn credential and study-guide pages.

## Cross-cutting official constraints

**Scoring** — Technical exams scored 1–1000; pass is **700 or greater**; scaled, **not** 70% of items; multi-part items can award partial credit; no guessing penalty; some items unscored; Microsoft does not reveal which items were wrong. All six GitHub study guides link this page and restate 700+.

**Duration / item types / labs** — Question count is subject to change; most Microsoft exams typically 40–60, **can vary**; **not published per GitHub exam**. Table: Fundamentals 45 min; associate/expert without labs 100 min; associate/expert that may contain labs 120 min. GH-900 is Beginner but 100 min. GH-600’s 120 min matches the “may contain labs” row; Microsoft **does not publish which exams have labs**. Microsoft **does not identify specific exam formats or question types before the exam**. All six GitHub credential pages use “may have interactive components”. GitHub exams **cannot** open Microsoft Learn during the exam.

**Delivery** — Pearson VUE, online or test center; first retake after 24 hours.

**Languages / extra time** — If the exam is not in the preferred language, the candidate can request **+30 minutes**.

**Catalog lag** — GitHub Docs still omits GH-600.

## What this product already froze (GH-600 accident)

Do not treat these as general:

- `DomainId` closed union of six GH-600 slugs; CONTEXT.md: “One of the six published GH-600 subject areas. A closed set”
- `fullExamDistribution` 30 items
- `PASS_SCORE = 70` as percent-correct
- Full-exam timer **45 minutes** vs official 120 (GH-600) or 100 (GH-300 and the other four)
- `QuestionType = "single" | "multiple"` only

## Must parameterize per exam

1. Exam code (`GH-900` … `GH-600`) and Pearson `examUid`
2. Credential title vs exam/study-guide title (splits on GH-100 and GH-600)
3. Level (Beginner vs Intermediate)
4. Exam duration (100 vs 120 minutes; not Microsoft Fundamentals 45; not this app’s 45)
5. Domain count (5, 6, or 7)
6. Domain identity: ids, official titles, optional “Domain N” prefix, weight **ranges**, nested objectives
7. Skills-measured effective date / changelog
8. Languages (five vs English-only)
9. +30 minutes when exam language ≠ preferred language
10. Official Learn practice assessment presence (absent on GH-600)
11. Sandbox URL
12. Question count — unpublished; must not freeze 30 or 40–60
13. Item types — unpublished mix; must not freeze single/multiple-only
14. Scoring presentation — scaled 700/1000 vs percent-correct
15. Audience / role tags
16. Catalog membership (GitHub Docs vs Learn)

## Appears stable across current GitHub exams

- Pearson VUE, proctored, online or test center
- First retake after 24 hours
- Pass bar **700 / 1000** on every GitHub study guide
- No Microsoft Learn resource during GitHub exams
- “May have interactive components” boilerplate
- One exam earns the credential

## Unpublished — do not invent

- Per-exam question count
- Per-exam item-type mix or lab presence
- Whether GH-600 is currently beta
- Exact USD price on GitHub exam pages
- Whether GH-900 expires (Beginner vs Microsoft Fundamentals)
- A 7th GH-300 domain (duplicate title only)

## Architecture implication (research only)

A multi-exam practice kernel should take an **exam profile**: code, titles, duration, language set, domain vector `{id, title, weightRange}`, scoring `{scale, passMark}`, allowed item types, optional official-practice-assessment flag. GH-300 is a 100-minute, six-area, five-language, 700-scaled profile — not a reskin of GH-600’s 120-minute six agent domains, and not this repo’s 45-minute / 30-item / 70% full exam.
