# Loom

Loom is a Claude Code and Codex plugin for building trust in work entrusted to AI. It grounds decisions in the current system, guides changes, and makes their results checkable.

V2 draws on [pstack](https://github.com/cursor/plugins/tree/main/pstack)'s task-sensitive routing and real-outcome verification. Its skills and templates were written anew for Loom's goals.

This version is a starting point. Real tasks expose failures in judgment, execution, and verification. Fixing and rechecking those failures expands what can be entrusted to the agent. Sustained autonomous work is a direction to grow toward through those improvements.

[English](README.md) | [한국어](README.ko.md)

## Choose the process the task needs

Loom v2 does not require a fixed `shape → plan → task` sequence. `work` selects an [execution route](skills/work/references/change-routes.md) from the outcome the user wants. A defect starts with reproduction and cause. A performance issue starts with a measurement. A behavior-preserving refactor starts by recording the current behavior. A change to responsibilities or contracts calls for `architect`.

Constraints found during investigation inform the design. Contracts chosen in the design carry through implementation and verification. Each unit ends in a check, the final diff gets cleaned, and work reaches the delivery point the user requested. Failures and inconclusive checks retain their conditions and evidence.

Size alone does not require human approval. Questions that observation or an experiment can settle should be investigated. If a domain, product, experience, or external-contract choice remains for a person to make, or the user asks to review the design first, Loom shows the options and effects before dependent implementation proceeds.

## Skills

| Skill         | Responsibility                                                                                                        |
| ------------- | --------------------------------------------------------------------------------------------------------------------- |
| `work`        | One agent owns routing, implementation, cleanup, verification, and delivery within the goal and scope.                |
| `orchestrate` | Plan and assign work in one worktree, track progress, and review results against acceptance criteria.                 |
| `understand`  | Reconstruct the current picture from code, runtime evidence, and history. Direct invocation investigates and reports. |
| `explore`     | Refine questions through references, derive mechanisms and applicability conditions, and return design candidates.    |
| `architect`   | Define component responsibilities and boundaries through strategic design, then specify input and output contracts.   |
| `verify`      | Prepare tests or temporary verification tools before implementation, then check actual outcomes during and after it.  |
| `review`      | Find gaps in decisions and evidence through counterexamples, then check the findings themselves.                      |
| `write`       | Connect problems, evidence, judgments, and conclusions; refine wording while preserving meaning and constraints.      |

Requests for explanation, design, verification, or review stay within that scope. Implementation and fixes follow the scope of the work entrusted to the agent.

`explore` can start before the research question is clear. It investigates examples, applies their mechanisms to the current problem, and revises its questions. It hands candidates and selection conditions to design, or returns reasons to redefine the problem or defer judgment. Long explorations retain changed assumptions, source evidence, and remaining questions in the conversation or an execution plan when needed. Changes with known approaches and applicability conditions do not require a separate exploration.

`architect` designs component responsibilities, boundaries, and relationships around the problem to solve. It refines input/output, state and failure contracts within the agreed boundaries, then checks how they connect through the complete execution flow. Small changes reuse existing boundaries and contracts.

Use `verify` before implementation to define verification criteria and prepare executable checks. Reuse existing checks, add tests or temporary verification tools where needed, and run them to capture an expected failure or baseline. When only preparation is requested, hand over the checks and execution instructions; implementing product behavior remains subject to the assigned scope.

`work` is the default single-agent route; use `orchestrate` for multi-agent collaboration.

Use `write` when writing or reviewing prose. `write` owns scope and delivery, applies [clarity criteria](skills/write/references/clarity.md) to all prose, and adds [document framing](skills/write/references/framing.md) when the request involves building or reviewing the reasoning. Editing and summarization preserve the source's direction and judgments.

## Coordinate multiple agents in one worktree

When multi-agent collaboration is requested, the main agent uses `orchestrate` to own the overall plan. This coordinator derives child tasks from the overall acceptance criteria, defining each task's contribution, scope, owner, dependencies, and execution order, along with integration and overall verification. Acceptance criteria specify observable outcomes, verification methods, expected results, and evidence to return. Subagents act as workers, using `work` to plan, execute, and verify their assigned scope. Model selection follows user and project policy; if no selection exists, the coordinator asks before the first launch.

The coordinator assigns files so concurrent writers do not overlap in the shared worktree, and orders work that depends on earlier results or changes to common files. Each worker receives its scope, acceptance criteria, necessary context, and reporting instructions. Workers report agreed intermediate results, blockers, and changed assumptions. The coordinator compares execution status with evidence for each criterion and remaining work, then updates the plan and assigns follow-up work or corrections. Changes to scope or acceptance criteria, further delegation, and coordination between workers belong to the coordinator.

Workers follow the [delegated-work instructions](skills/work/references/delegated-work.md), read the specification and source evidence provided by the coordinator, and return observations, artifacts, and remaining work through the host. The coordinator checks the current specification against the artifacts, accepts results that meet the criteria, and requests corrections with evidence when they do not. Overall completion requires accepted child results and verification of their combined behavior.

## Explain the design and maintain documents selectively

For a meaningful change, Loom explains what happens now, what will change, what stays true, and why. The task conversation normally holds that explanation. Create a maintained document when future work will depend on it.

- Working explanations serve the current task.
- PR and commit descriptions preserve the decisions and evidence from that change; they are historical records.
- Usage, external contracts, and verification procedures become living documents only when future readers rely on them.

Use the [execution-plan template](templates/execution-plan.md) when a multi-phase effort needs a file to coordinate or resume work. Use the [verification-recipe template](templates/verification-recipe.md) when a real user path needs a reusable check. Ordinary work needs neither.

## Repository layout

```text
scripts/check-plugin.ts  Plugin metadata and documentation reference checks
skills/                  Agent task instructions
templates/               Planning and verification document templates
```

## Improve and check the skills

Use observed failures and omissions from real work to change the instructions or execution tools. Recheck the same conditions afterward. A structural check does not prove that a skill improves the agent's decisions or execution.

Keep shared judgments in the skill that owns them; put conditional procedures in references with an explicit reading trigger. Keep authority and failure rules visible before the affected action. Keep the criteria for applicability, source attribution, and completion in the skills. Compare a saved baseline with the revision on predefined tasks, using fresh sessions and a no-skill condition when agent evaluations are authorized. File size alone does not measure actual reading cost or behavioral quality. Record the references that were read, results, tool errors and remaining uncertainty; do not impose a fixed compression target.

Repository scripts use TypeScript (`.ts`) with explicit `.ts` imports and erasable type syntax. Development tooling requires Node.js 22.x from 22.18, 24.x, or 26+. Development dependencies use the Yarn version pinned in `package.json`, with the `pnpm` node linker. Install them and set up the Git hooks once per clone:

```bash
yarn install --immutable
yarn hooks:install
```

TypeScript checks types, Oxlint lints the code, and Oxfmt formats source files, configuration, and Markdown. Historical records in `.loom/` are excluded. Lefthook runs repository-wide type, lint, format, plugin structure, and documentation reference checks before each commit without modifying or staging files. Run `yarn lint:fix` and `yarn format` to apply fixes, then stage the changes you intend to commit.

Run `yarn validate` for all checks. It runs type, lint, format, and plugin checks in order, stopping on failure. You can also run individual checks:

```bash
yarn lint
yarn format:check
yarn check
yarn typecheck
```

`yarn typecheck` checks `scripts` with strict TypeScript and emits no files. Node execution strips types without checking them, so the pre-commit hook runs type checking alongside lint and formatting.

`yarn check` validates metadata, manifest consistency, and local file and heading references.

On real tasks, inspect the process and artifacts for preserved goals and scope, required checks, and evidence of the outcome. A description of having followed a skill is not proof of success.

## Install and use

Claude Code:

```bash
claude plugin marketplace add grapgrap/loom
claude plugin install loom@loom-marketplace
```

Codex:

```bash
codex plugin marketplace add grapgrap/loom
codex plugin add loom@loom-marketplace
```

Start a new session so the installed skills are available. Invoke `/loom:work` in Claude Code or `$loom:work` in Codex.

```text
/loom:work Notifications are sent twice after a retry. Reproduce the problem, fix its cause, and verify the same path.
$loom:orchestrate Divide this change among agents in the same worktree and verify their combined result.
$loom:explore Explore references for improving retries of long-running jobs, starting with what we should investigate. Do not design yet.
$loom:architect Show the current ownership and proposed user experience first. Do not implement yet.
$loom:understand Explain how payment failures work now and why the system was shaped this way.
$loom:write Connect this design proposal's problem, evidence, judgment, and scope, then refine the wording.
```

## Migrate from v1

V1's `propose`, `shape`, `plan`, `task`, and `calibrate` are not retained as command names. Use `work` for most changes, `understand` for the current design, and `architect` for design-only requests. `work` creates a multi-phase plan only when the task needs one. `review` remains available.

Existing `.loom/` project documents are neither deleted nor automatically converted. V2 can consult them as historical evidence, but does not impose a new obligation to keep them current.
