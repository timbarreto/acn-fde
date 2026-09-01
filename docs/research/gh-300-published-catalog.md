# GH-300 published catalog

Captured 2026-09-01 from Microsoft Learn / GitHub first-party pages only.
This is the proving catalog [Capture the GH-300 published catalog](https://github.com/timbarreto/acn-fde/issues/121) asked the spec to encode.

## Authority

| Claim | Owner | URL |
| --- | --- | --- |
| Domains, weights, nested objectives | Exam GH-300 study guide, "Skills measured as of August 7, 2026" | https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/gh-300 |
| Short link (redirect, page not moved) | aka.ms | https://aka.ms/GH300-StudyGuide |
| Credential title, duration, languages, interactive-components note | GitHub Copilot certification page | https://learn.microsoft.com/en-us/credentials/certifications/github-copilot/ |
| Pass mark 700 (technical exams; also stated on the study guide useful-links table) | Exam scoring and score reports | https://learn.microsoft.com/en-us/credentials/certifications/exam-scoring-reports |
| GitHub exams cannot open Microsoft Learn in-session | Exam duration and exam experience | https://learn.microsoft.com/en-us/credentials/support/exam-duration-exam-experience |
| Seven unweighted topic labels (not the proving catalog) | About GitHub Certifications | https://docs.github.com/en/get-started/showcase-your-expertise-with-github-certifications/about-github-certifications |

The study-guide source repo `MicrosoftDocs/learn-certs-pr` is not publicly fetchable (404). Public authority is the rendered Learn page (`git_commit_id` `f4e384b61cefe9943cd297953ccecb90be33aeb9`, last updated 2026-07-09, `ms.date` 2026-05-31). There is no live `/credentials/certifications/exams/gh-300/` page (404).

## Exam identity

- **Exam title:** Exam GH-300: GitHub Copilot
- **Credential title:** GitHub Copilot (Intermediate)
- **Schedule UID:** `exam.GH-300`
- **Duration published:** 100 minutes (credential page). Seat duration is not published for GH-300 specifically.
- **Passing score published:** 700 or greater (study guide useful-links table; same figure on the technical-exam scoring page). Scaled 1–1,000; 700 is not “70% of points”.
- **Item types:** not enumerated for GH-300. Credential page: “You may have interactive components to complete as part of this exam.” Sandboxes: https://GHCertDemo.starttest.com and https://aka.ms/examdemo.
- **Question count:** not published for GH-300.
- **Languages:** English, Spanish, Portuguese (Brazil), Korean, Japanese.
- **Version heading:** Skills measured as of August 7, 2026. Credential page last updated 08/07/2026.

## Domains to encode (six)

Weights use an en dash as published. Nested bullets are the official “how we are assessing that skill” list; related topics may still appear on the exam.

### 1. Use GitHub Copilot responsibly (15–20%)

Understand responsible AI principles

- Describe risks and limitations of Generative AI tools
- Describe ethical and responsible AI usage
- Identify potential harms and mitigation strategies of AI usage

Validate and operate AI tools

- Explain the need to validate AI output
- Identify how to operate GitHub Copilot responsibly

### 2. Use GitHub Copilot features (25–30%)

Use GitHub Copilot in the IDE

- Enable Copilot in the IDE
- Trigger Copilot through inline suggestions, chat, CLI, and agent mode
- Configure content exclusions for specific files or repositories (app knowledge)

Use GitHub Copilot CLI

- Define GitHub Copilot CLI and how it benefits developers
- Identify the steps for installing GitHub Copilot CLI
- Describe key GitHub Copilot CLI features and commands
- Use GitHub Copilot CLI interactively and in sessions
- Generate scripts and manage files with GitHub Copilot CLI

Use GitHub Copilot features and capabilities

- Use Agent Mode, Copilot Edits, and MCP for enhanced development and workflows; manage Agent Sessions and delegate tasks to Sub‑Agents for optimized context usage
- Use Copilot for code review and coding assistance
- Utilize Spaces, Spark, Pull Request summaries, and customizable review standards via instructions files
- Understand the limits, options, feedback, and commands of GitHub Copilot Chat; include prompt file reuse for consistent responses

Manage organization-wide settings and policies

- Configure organization-wide policy management; enable Copilot Code Review policies and manage feature availability across IDEs and github.com
- Utilize audit log events
- Manage subscriptions using the REST API

### 3. Understand GitHub Copilot data and architecture (10–15%)

Describe data handling and flow

- Explain data usage, flow, and sharing
- Describe input processing and prompt building
- Explain proxy filtering and post-processing

Understand lifecycle and limitations

- Visualize code suggestion lifecycle
- Describe limitations of LLMs and Copilot

### 4. Apply prompt engineering and context crafting (10–15%)

Craft effective prompts

- Describe prompt structure and context
- Understand how context is determined
- Use zero-shot and few-shot prompting
- Apply best practices for prompt crafting

Engineer prompts for performance

- Explain prompt engineering principles
- Describe prompt process flow and chat history usage

### 5. Improve developer productivity with GitHub Copilot (10–15%)

Enhance productivity and code quality

- Use Copilot for code generation, refactoring, and documentation
- Accelerate learning and reduce context switching
- Generate sample data and modernize legacy code

Support testing and security

- Generate unit and integration tests
- Identify edge cases and write assertions
- Suggest security improvements and performance optimizations

### 6. Configure privacy, content exclusions, and safeguards (10–15%)

Manage privacy settings and exclusions

- Configure content exclusions and editor settings
- Describe ownership and limitations of outputs

Apply safeguards and troubleshoot

- Enable suggestions matching public code filtering
- Resolve issues with suggestions and content exclusions

## Do not encode as a seventh domain

The study-guide “Skills at a glance” list and the credential page “Assessed on this exam” list both include an extra bullet **GitHub Copilot features (25–30%)** beside **Use GitHub Copilot features (25–30%)**. There is no matching skills-measured section, no unique objectives, and the change log treats “Use GitHub Copilot features” as one functional group. Counting it as a seventh domain would make weights sum to 105–140%. Keep six domains.

GitHub Docs lists seven unweighted topic labels (Responsible AI; Copilot plans & features; Copilot data & functionality; Prompt engineering; AI developer use cases; Testing with Copilot; Privacy & exclusions). Those are a coarser overlay: “Testing with Copilot” sits under domain 5. Not the proving catalog.

## Not published

- GH-300-specific question count
- GH-300-specific item-type list (MCQ / multi-select / etc.)
- GH-300-specific seat duration
- Objectives for the extra “GitHub Copilot features” glance line
