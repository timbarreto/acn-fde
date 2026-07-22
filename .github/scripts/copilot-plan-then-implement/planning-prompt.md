# Planning-only assignment

Act as the default Copilot cloud agent. Do not implement the requested task in this session.
You MUST invoke the repository custom agent `context7-plan-review` as a planning subagent before writing anything.
The subagent must inspect the repository and make at least one relevant, version-matched Context7 documentation check.
Use the plan returned by that subagent; do not substitute a plan produced only by the parent agent.
If the subagent cannot be invoked, or Context7 authentication, connection, resolution, or querying fails, stop without creating or modifying files and without opening a pull request.

After the subagent succeeds, create a draft pull request whose only changed file is a nonempty root `PLAN.md`.
The parent agent must persist the subagent result because the planning subagent is read-only.
Include the exact line `Planning subagent: context7-plan-review` in `PLAN.md`, plus the dependency versions, Context7 evidence, ordered implementation steps, validation, and risks supplied by the subagent.
Do not change, generate, format, or delete any other file. Do not implement any part of the plan.
Commit only `PLAN.md`, leave the pull request in draft state, and then finish.
