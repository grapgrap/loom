# Loom

Loom is a Claude Code and Codex plugin for building trust in work entrusted to AI. It grounds decisions in the current system, guides changes, and makes their results checkable.

V2 draws on [pstack](https://github.com/cursor/plugins/tree/main/pstack)'s task-sensitive routing and real-outcome verification. Its skills and templates were written anew for Loom's goals.

This version is a starting point. Real tasks expose failures in judgment, execution, and verification. Fixing and rechecking those failures expands what can be entrusted to the agent. Sustained autonomous work is a direction to grow toward through those improvements.

[English](README.md) · [한국어](README.ko.md)

## Use only the process the task earns

Loom v2 does not require a fixed `shape → plan → task` sequence. `work` selects an [execution route](skills/work/references/change-routes.md) from the outcome the user wants. A defect starts with reproduction and cause. A performance issue starts with a measurement. A behavior-preserving refactor starts by recording the current behavior. A change to responsibilities or contracts calls for `architect`.

Constraints found during investigation inform the design. Contracts chosen in the design carry through implementation and verification. Each unit ends in a check, the final diff gets cleaned, and work reaches the delivery point the user requested. Failures and inconclusive checks retain their conditions and evidence.

Size alone does not require human approval. Questions that observation or an experiment can settle should be investigated. If a domain, product, experience, or external-contract choice remains for a person to make, or the user asks to review the design first, Loom shows the options and effects before dependent implementation proceeds.

## Skills

| Skill         | Responsibility                                                                                                        |
| ------------- | --------------------------------------------------------------------------------------------------------------------- |
| `work`        | One agent owns routing, implementation, cleanup, verification, and delivery within the goal and scope.                |
| `orchestrate` | Plan, relate, assign, track, submit, and accept work through the shared work CLI.                                     |
| `understand`  | Reconstruct the current picture from code, runtime evidence, and history. Direct invocation investigates and reports. |
| `architect`   | Ground implementation and verification in usage examples, responsibilities, state, and interfaces.                    |
| `verify`      | Judge finish conditions on the real artifact and user path as confirmed, failed, or inconclusive.                     |
| `review`      | Find gaps in decisions and evidence through counterexamples, then check the findings themselves.                      |
| `write`       | Connect problems, evidence, judgments, and conclusions; refine wording while preserving meaning and constraints.      |
| `tidy`        | Consolidate records and work history into grounded project memories and graphs while preserving originals.            |

Requests for explanation, design, verification, or review stay within that scope. Implementation and fixes follow the scope of the work entrusted to the agent.

Loom's [principles](references/principles.md) describe the domain responsibilities, contracts, and dependencies a change must preserve. Skills follow this shared document's application procedure to select relevant principles from the task's purpose and impact. Each principle includes application situations and examples. `work` is the default single-agent route; use `orchestrate` for multi-agent collaboration.

`work` and `review` select relevant [code rules](references/rules.md) by application situation and decision criteria, then read the individual files for practical guidance on names, functions, state, validation, error handling, and tests. Both use `write` when writing or reviewing prose. `write` owns scope and delivery, applies [clarity criteria](skills/write/references/clarity.md) to all prose, and adds [document framing](skills/write/references/framing.md) when the request involves building or reviewing the reasoning. Editing and summarization preserve the source's direction and judgments.

## Coordinate multiple agents in one worktree

When multi-agent collaboration is requested, the main agent uses `orchestrate` to own the overall plan. This coordinator derives child tasks from the overall acceptance criteria, defining each task's contribution, scope, owner, dependencies, and execution order, along with integration and overall verification. Acceptance criteria specify observable outcomes, verification methods, expected results, and evidence to return. Subagents act as workers, using `work` to plan, execute, and verify their assigned scope. Model selection follows user and project policy; if no selection exists, the coordinator asks before the first launch.

The coordinator assigns files so concurrent writers do not overlap in the shared worktree, and orders work that depends on earlier results or changes to common files. Each worker receives its scope, acceptance criteria, necessary context, and recording and reporting instructions. Workers report agreed intermediate results, blockers, and changed assumptions. The coordinator compares execution status with evidence for each criterion and remaining work, then updates the plan and assigns follow-up work or corrections. Changes to scope or acceptance criteria, further delegation, and coordination between workers belong to the coordinator.

The overall task and its children use the [shared work CLI](skills/work/references/context-work.md). Child definitions connect parent, contributesTo, and dependsOn; assign records the worker, reviewer, and host execution ID. Workers report observations and evidence per criterion, then submit a fixed result. The coordinator directly applies review against the artifacts before accept or criterion-specific request-changes. Work show --tree returns related work, readiness, blockers, review queues, and missing criteria. Whole-work completion requires completed mandatory children and the parent's own integration evidence. The CLI does not launch agents; the coordinator owns shared tidy runs.

## Explain design without accumulating a design corpus

For a meaningful change, Loom explains what happens now, what will change, what stays true, and why. That picture normally lives in the task conversation rather than a project-wide design-document graph.

- Working explanations serve the current task.
- PR and commit descriptions preserve the decisions and evidence from that change; they are historical records.
- Usage, external contracts, and verification procedures become living documents only when future readers rely on them.

Use the [execution-plan template](templates/execution-plan.md) when a multi-phase effort needs a file to coordinate or resume work. Use the [verification-recipe template](templates/verification-recipe.md) when a real user path needs a reusable check. Ordinary work needs neither.

## Carry context into later work

Work recalls prior decisions, current work, and relevant records. Work create defines the goal, scope, and acceptance criteria; report saves progress, criterion observations, evidence, and next actions. Standalone work uses complete; delegated work uses submit followed by reviewer acceptance. Changes to definitions, assignments, or prerequisite evidence invalidate affected checks and results. Decisions and their sources remain short record notes. Inputs go through stdin without storage payload files or user reviews of memory files. Current requests and project instructions take precedence.

Recall returns unfinishedWorks for unfinished work, unreviewedWorks for records needing state review, and awaitingReviewWorks for submitted results. After short requests and before a final response, agents check the next action within their assignment. Submitted work awaits its reviewer and is not automatically rerun. Temporary task switches preserve the original unfinished goal; actual blockers, user pauses, and cancellations retain their reasons. Other conversations and live workers must be checked before resumption. The [unfinished-work protocol](skills/work/references/context.md#미완료-업무를-확인하고-재개한다) guides the agent; the CLI does not launch background execution.

When the relevant work is not yet known, search original records using terms from the current objective, then compare the candidate work's current memories, graph, and pending records. Search rank and the latest revision of an original file do not establish which judgment applies now. Distinguish agreements, code observations, and proposals, and compare their work scope, observed code version, and execution conditions before selecting evidence. First and latest note excerpts help identify work that has not yet been consolidated.

Record the evidence and application conditions adopted for important decisions in a short note. At a completed work unit or before the next important decision based on that evidence, check the relevant work's current memories, graph, and new records for changes that affect the judgment. Rereading an immutable source reference does not reveal whether the current judgment has been superseded. Recall lists support limits and offsets, and an exact source reference reads only its own file. Memory and work-state entries in an apply response are limited to that request.

Tidy reads an unprocessed batch, searches related originals with BM25, and updates memories, entities, and statements. The work CLI owns managed work state; tidy and checkpoint cannot overwrite it. Existing checkpoint work and exact refs remain supported. Continuing legacy work can be explicitly adopted after reading its current state, without converting previous completion claims into criterion evidence. Statement sources and inference premises retain their basis; original records, earlier statements, unresolved judgments, and work scopes are preserved. Apply advances the reviewed range with the consolidated view and leaves new arrivals pending. Its report summarizes actual changes.

`graph` retrieves related statements, paths, and original evidence from an entity or text query. `recall` also returns graph context alongside pending originals. See the [graph contract](skills/work/references/context-graph.md) for statement construction, scope, and traversal limits. The agent interprets the evidence; the CLI validates and stores the relationships.

`recall` reports when consolidation is due: 20 pending originals or an oldest pending original at least 24 hours old. `work` checks at startup and stable work boundaries, including during a long-running conversation. Explicit `$loom:tidy` requests can run sooner. This is an invocation-time check; it does not install a background scheduler.

The [context script](scripts/context/cli.ts) runs directly on Node.js 22.x from 22.18, 24.x, or 26+, with Git and no npm runtime dependencies or build step. Node is the only supported JavaScript runtime. Its default data root is `~/Library/Application Support/loom` on macOS, `%LOCALAPPDATA%\loom` on Windows, and `$XDG_DATA_HOME/loom` or `~/.local/share/loom` on Linux. Records live outside plugin installations and Git checkouts. Worktrees of the same local repository share them; separate clones and machines do not synchronize.

If the sandbox blocks writes to the storage path, the agent explains the actual path and storage purpose when requesting permission through the host's existing approval flow. Once approved, it retries the write at the same path and reads the result back to verify it.

Start recall through the [macOS/Linux launcher](scripts/context/cli.sh) or [Windows launcher](scripts/context/cli.cmd). Missing Node or Git produces a dependency error. The agent locates an existing executable or installs the dependency, verifies versions, and retries the original command. Git identifies the project shared by its worktrees.

Users can ask Loom to recall, revise, or forget a memory. The `location` command reports storage paths. An absolute `LOOM_DATA_DIR` or `--data-dir` overrides the data root. [Work context](skills/work/references/context.md) defines invocation, scopes, revisions, and failure behavior.

## Repository layout

```text
src/context/             Runtime modules and unit tests by concern, with shared base types
scripts/context/         CLI and shell/CMD entry points
src/integration-test/               Integration tests and shared test helpers
scripts/check-plugin.ts  Plugin metadata and documentation reference checks
skills/                  Agent task instructions
references/              Shared design principles and code rules
templates/               Planning and verification document templates
```

Inside `src/context`, modules are grouped by concern. Each area's types live in its `model.ts`; only shared base types such as scopes, sources, and revisions remain in the top-level `model.ts`. The erasure request type is defined by `operations/forget.ts`.

| Directory    | Responsibility                                                      |
| ------------ | ------------------------------------------------------------------- |
| `records`    | Validation and revisions for memories, checkpoints, and daily notes |
| `work`       | Work definitions, state transitions, and ledger storage             |
| `sources`    | Original record collection, ref lookup, cursors, and search ranking |
| `graph`      | Entities, statements, relationships, and graph queries              |
| `tidy`       | Consolidation snapshots, memory updates, and result reports         |
| `storage`    | Storage paths, file reads, atomic updates, and locking              |
| `operations` | Context recall, erasure, and legacy writes across areas             |

The CLI entry point calls `src/context`; runtime modules do not import tests or development tools. Add runtime modules under `src/context` and place their unit tests beside them as `*.test.ts`. Keep integration tests spanning modules, the CLI, or the real filesystem, along with shared helpers, under `src/integration-test`. Skills and user instructions use the entry points in `scripts/context`. Standalone copies must include both `scripts/context` and `src/context`.

## Improve and check the skills

Use observed failures and omissions from real work to change the instructions or execution tools. Recheck the same conditions afterward. A structural check does not prove that a skill improves the agent's decisions or execution.

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
