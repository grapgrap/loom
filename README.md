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
| `orchestrate` | Plan, relate, assign, track, submit, and accept work through the shared work CLI.                                     |
| `understand`  | Reconstruct the current picture from code, runtime evidence, and history. Direct invocation investigates and reports. |
| `architect`   | Define component responsibilities and boundaries through strategic design, then specify input and output contracts.   |
| `verify`      | Prepare tests or temporary verification tools before implementation, then check actual outcomes during and after it.  |
| `review`      | Find gaps in decisions and evidence through counterexamples, then check the findings themselves.                      |
| `write`       | Connect problems, evidence, judgments, and conclusions; refine wording while preserving meaning and constraints.      |
| `tidy`        | Update current memories and review history from source records while preserving the originals.                        |

Requests for explanation, design, verification, or review stay within that scope. Implementation and fixes follow the scope of the work entrusted to the agent.

`architect` designs component responsibilities, boundaries, and relationships around the problem to solve. It refines input/output, state and failure contracts within the agreed boundaries, then checks how they connect through the complete execution flow. Small changes reuse existing boundaries and contracts.

Use `verify` before implementation to define verification criteria and prepare executable checks. Reuse existing checks, add tests or temporary verification tools where needed, and run them to capture an expected failure or baseline. When only preparation is requested, hand over the checks and execution instructions; implementing product behavior remains subject to the assigned scope.

Loom's [principles](references/principles.md) describe the domain responsibilities, contracts, and dependencies a change must preserve. When design decisions concern responsibilities, contracts, or dependencies, skills consult this shared document and select relevant principles from the task's purpose and impact. Each principle includes application situations and examples. `work` is the default single-agent route; use `orchestrate` for multi-agent collaboration.

`work` and `review` select relevant [code rules](references/rules.md) by application situation and decision criteria, then read the individual files for practical guidance on names, functions, state, validation, error handling, and tests. Both use `write` when writing or reviewing prose. `write` owns scope and delivery, applies [clarity criteria](skills/write/references/clarity.md) to all prose, and adds [document framing](skills/write/references/framing.md) when the request involves building or reviewing the reasoning. Editing and summarization preserve the source's direction and judgments.

## Coordinate multiple agents in one worktree

When multi-agent collaboration is requested, the main agent uses `orchestrate` to own the overall plan. This coordinator derives child tasks from the overall acceptance criteria, defining each task's contribution, scope, owner, dependencies, and execution order, along with integration and overall verification. Acceptance criteria specify observable outcomes, verification methods, expected results, and evidence to return. Subagents act as workers, using `work` to plan, execute, and verify their assigned scope. Model selection follows user and project policy; if no selection exists, the coordinator asks before the first launch.

The coordinator assigns files so concurrent writers do not overlap in the shared worktree, and orders work that depends on earlier results or changes to common files. Each worker receives its scope, acceptance criteria, necessary context, and recording and reporting instructions. Workers report agreed intermediate results, blockers, and changed assumptions. The coordinator compares execution status with evidence for each criterion and remaining work, then updates the plan and assigns follow-up work or corrections. Changes to scope or acceptance criteria, further delegation, and coordination between workers belong to the coordinator.

The overall task and its children use the [shared work CLI](skills/work/references/context-work.md). Child definitions connect parent, contributesTo, and dependsOn; assign records the worker, reviewer, and host execution ID. Workers read the current specification and evidence through the CLI, explain the goal and contracts they understand, and return observations, evidence, and remaining work through the host. The coordinator owns every task, records report and submit, and directly applies review against the artifacts before accept or criterion-specific request-changes. Subagents use the CLI read-only; the coordinator also owns record and tidy. There is no understanding-complete state or extra approval step. Work show --tree returns related work, readiness, blockers, review queues, and missing criteria. Overall work completion requires completed mandatory children and the parent's own integration evidence. The CLI does not launch agents.

## Explain the design and maintain documents selectively

For a meaningful change, Loom explains what happens now, what will change, what stays true, and why. The task conversation normally holds that explanation. Create a maintained document when future work will depend on it.

- Working explanations serve the current task.
- PR and commit descriptions preserve the decisions and evidence from that change; they are historical records.
- Usage, external contracts, and verification procedures become living documents only when future readers rely on them.

Use the [execution-plan template](templates/execution-plan.md) when a multi-phase effort needs a file to coordinate or resume work. Use the [verification-recipe template](templates/verification-recipe.md) when a real user path needs a reusable check. Ordinary work needs neither.

## Carry context into later work

Work applies the current request and project instructions first. The work CLI owns definitions, progress, criterion checks, and next actions. Coordinators register delegated results with report and submit, then inspect artifacts before accept. New mutations use requestKey: a retry recovers the original result even after later changes. A met check connects the observed work definition with the target, version, and execution conditions. Historical completion claims never acquire invented verification evidence.

Reusable decisions, observations, and inferences are captured as [evidence](skills/work/references/context-evidence.md), with their source, capture method, and application conditions. Adoption, correction, and withdrawal explicitly reference an immutable original and optionally a partial range. Proposals remain distinct from adopted decisions; withdrawing a replacement does not revive the earlier constraint. Existing notes, memories, checkpoints, and exact refs remain historical material.

`discover` searches both original and derived vocabulary, grouping revisions of one source while preserving independent notes. `context prepare` returns work state, candidates, originals, connected corrections, and coverage gaps. The agent compares them with the current target, version, and conditions to decide applicability. At important decision boundaries, the prior basis checks both newly discovered independent evidence and corrections to existing evidence. Rank and latest refs do not establish current validity.

`tidy` reviews selected originals and current memories, then writes derived representations and the exact reviewed set. Reviewing a later record leaves unread earlier records pending. Related corrections require a new review; unrelated arrivals stay pending. A no-change receipt terminates repeated review of the same inputs and purpose without incrementing the representation revision. Tidy does not implicitly adopt evidence, withdraw decisions, or complete work. Existing graph, works, and absorb writes require explicit legacy mode.

When the overall assignment is known, `work show --work <overall-id> --tree` exposes remaining criteria. Otherwise, recall's unfinished, unreviewed, and awaiting-review candidates are compared with current authorization and originals. Temporary interruptions preserve the original goal, and live workers or work belonging to another conversation are not automatically restarted. The [unfinished-work protocol](skills/work/references/context.md#미완료-업무를-확인하고-재개한다) guides the agent; the CLI does not launch execution.

`tidy status --work <id> --purpose resume` reports scoped pending and review needs. The count, age, context size, and growth signals are supplementary; agents check at work boundaries and explicit tidy requests. Checks run on invocation, without background timers. See [working context](skills/work/references/context.md) for input, lookup, and recovery contracts.

`recall` and `tidy apply` return compact results by default; use `--full` for complete candidate bodies and before/after changes. New tidy writes use storage format v4 and can read v1–v3. Once written as v4, the same store cannot be opened by CLI versions 2.12 or earlier, so workers sharing data must update together. `legacy: true` accepts earlier operations; it does not write the earlier storage format.

The [context script](scripts/context/cli.ts) runs directly on Node.js 22.x from 22.18, 24.x, or 26+, with Git and no npm runtime dependencies or build step. Node is the only supported JavaScript runtime. Its default data root is `~/Library/Application Support/loom` on macOS, `%LOCALAPPDATA%\loom` on Windows, and `$XDG_DATA_HOME/loom` or `~/.local/share/loom` on Linux. Records live outside plugin installations and Git checkouts. Worktrees of the same local repository share them; separate clones and machines do not synchronize.

If the sandbox blocks writes to the storage path, the agent explains the actual path and storage purpose when requesting permission through the host's existing approval flow. Once approved, it retries the write at the same path and reads the result back to verify it.

Start recall through the [macOS/Linux launcher](scripts/context/cli.sh) or [Windows launcher](scripts/context/cli.cmd). Missing Node or Git produces a dependency error. The agent locates an existing executable or installs the dependency, verifies versions, and retries the original command. Git identifies the project shared by its worktrees.

Users can ask Loom to recall, revise, or forget a memory. The `location` command reports storage paths. An absolute `LOOM_DATA_DIR` or `--data-dir` overrides the data root. [Work context](skills/work/references/context.md) defines invocation, scopes, revisions, and failure behavior.

## Repository layout

```text
src/context/             Runtime modules and unit tests by concern, with shared base types
scripts/context/         CLI and shell/CMD entry points
src/integration-test/     Integration tests and shared test helpers
scripts/check-plugin.ts  Plugin metadata and documentation reference checks
skills/                  Agent task instructions
references/              Shared design principles and code rules
templates/               Planning and verification document templates
```

Inside `src/context`, modules are grouped by concern. Each area's types live in its `model.ts`; only shared base types such as scopes, sources, and revisions remain in the top-level `model.ts`. The erasure request type is defined by `operations/forget.ts`.

| Directory    | Responsibility                                                      |
| ------------ | ------------------------------------------------------------------- |
| `records`    | Validation and revisions for memories, checkpoints, and daily notes |
| `evidence`   | Immutable captures, explicit corrections, and correction lookup     |
| `work`       | Work definitions, state transitions, and ledger storage             |
| `sources`    | Original record collection, ref lookup, cursors, and search ranking |
| `graph`      | Entities, statements, relationships, and graph queries              |
| `tidy`       | Consolidation snapshots, memory updates, and result reports         |
| `storage`    | Storage paths, file reads, atomic updates, and locking              |
| `operations` | Context recall, erasure, and legacy writes across areas             |

The CLI entry point calls `src/context`; runtime modules do not import tests or development tools. Add runtime modules under `src/context` and place their unit tests beside them as `*.test.ts`. Keep integration tests spanning modules, the CLI, or the real filesystem, along with shared helpers, under `src/integration-test`. Skills and user instructions use the entry points in `scripts/context`. Standalone copies must include both `scripts/context` and `src/context`.

## Improve and check the skills

Use observed failures and omissions from real work to change the instructions or execution tools. Recheck the same conditions afterward. A structural check does not prove that a skill improves the agent's decisions or execution.

Keep shared judgments in the skill that owns them; put conditional procedures in references with an explicit reading trigger. Keep authority and failure rules visible before the affected action. CLI field syntax and examples belong in `<command> --help`; execute those examples before removing duplicated instructions. Keep the criteria for applicability, source attribution, and completion in the skills. Compare a saved baseline with the revision on predefined tasks, using fresh sessions and a no-skill condition when agent evaluations are authorized. File size alone does not measure actual reading cost or behavioral quality. Record the references and help that were read, results, tool errors and remaining uncertainty; do not impose a fixed compression target.

Repository scripts and tests use TypeScript (`.ts`) with explicit `.ts` imports and erasable type syntax. Development tooling supports the same Node.js versions as the context CLI. Development dependencies use the Yarn version pinned in `package.json`, with the `pnpm` node linker. Install them and set up the Git hooks once per clone:

```bash
yarn install --immutable
yarn hooks:install
```

TypeScript checks types, Oxlint lints the code, and Oxfmt formats source files, configuration, and Markdown. Historical records in `.loom/` are excluded. Lefthook runs repository-wide type, lint, format, plugin structure, and documentation reference checks before each commit without modifying or staging files. Run `yarn lint:fix` and `yarn format` to apply fixes, then stage the changes you intend to commit.

Run `yarn validate` for all checks and tests. It runs type, lint, format, and plugin checks in order, then the full test suite, stopping on failure. You can also run individual checks:

```bash
yarn lint
yarn format:check
yarn check
yarn typecheck
yarn test
```

`yarn typecheck` checks `src` (including unit and integration tests), `scripts`, and the Vitest configuration with strict TypeScript and emits no files. Node execution strips types without checking them, so the pre-commit hook runs type checking alongside lint and formatting.

`yarn check` validates metadata, manifest consistency, and local file and heading references. `yarn test` runs the Vitest suite once, separately from the commit hook. Use `yarn test:watch` for watch mode or `yarn test src/context/records/records.test.ts` for a single file. Use `yarn test src/context` for unit tests or `yarn test src/integration-test` for integration tests. Changes to runtime modules under `src/context` and entry points under `scripts/context` rerun the suite in watch mode, including tests that invoke separate Node processes. Editing a test file reruns that file and tests that depend on it.

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
$loom:architect Show the current ownership and proposed user experience first. Do not implement yet.
$loom:understand Explain how payment failures work now and why the system was shaped this way.
$loom:write Connect this design proposal's problem, evidence, judgment, and scope, then refine the wording.
```

## Migrate from v1

V1's `propose`, `shape`, `plan`, `task`, and `calibrate` are not retained as command names. Use `work` for most changes, `understand` for the current design, and `architect` for design-only requests. `work` creates a multi-phase plan only when the task needs one. `review` remains available.

Existing `.loom/` project documents are neither deleted nor automatically converted. V2 can consult them as historical evidence, but does not impose a new obligation to keep them current.
