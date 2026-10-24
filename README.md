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
| `orchestrate` | Coordinate multiple agents in one worktree through shared records, assignments, result judgments, and follow-up work. |
| `understand`  | Reconstruct the current picture from code, runtime evidence, and history. Direct invocation investigates and reports. |
| `architect`   | Ground implementation and verification in usage examples, responsibilities, state, and interfaces.                    |
| `verify`      | Judge finish conditions on the real artifact and user path as confirmed, failed, or inconclusive.                     |
| `review`      | Find gaps in decisions and evidence through counterexamples, then check the findings themselves.                      |
| `write`       | Connect problems, evidence, judgments, and conclusions; refine wording while preserving meaning and constraints.      |
| `tidy`        | Consolidate accumulated records into grounded project memories and work state while preserving originals.             |

Requests for explanation, design, verification, or review stay within that scope. Implementation and fixes follow the scope of the work entrusted to the agent.

Loom's [principles](references/principles.md) describe the domain responsibilities, contracts, and dependencies a change must preserve. Skills follow this shared document's application procedure to select relevant principles from the task's purpose and impact. Each principle includes application situations and examples. `work` is the default single-agent route; use `orchestrate` for multi-agent collaboration.

`work` and `review` select relevant [code rules](references/rules.md) by application situation and decision criteria, then read the individual files for practical guidance on names, functions, state, validation, error handling, and tests. Both use `write` when writing or reviewing prose. `write` owns scope and delivery, applies [clarity criteria](skills/write/references/clarity.md) to all prose, and adds [document framing](skills/write/references/framing.md) when the request involves building or reviewing the reasoning. Editing and summarization preserve the source's direction and judgments.

## Coordinate multiple agents in one worktree

When multi-agent collaboration is requested, `orchestrate` defines the overall outcome and acceptance criteria, then assigns work through the host's agent tools. Every subagent uses `work` for its assigned scope. Model selection follows user and project policy; if no selection exists, the coordinator asks before the first launch.

The coordinator assigns files so concurrent writers do not overlap in the shared worktree, and orders work that depends on earlier results or changes to common files. Each worker receives its scope, acceptance criteria, necessary context, and recording and reporting instructions. Scope changes, further delegation, and coordination between workers belong to the coordinator.

The overall task and each child task use separate work IDs in the existing shared context store. Workers record progress and verification evidence, then return the reference to their result summary. The coordinator directly applies `review`, prioritizing whether the acceptance criteria are met. It compares each criterion with artifacts and verification evidence, accepts results or requests corrections, creates follow-up work, and reviews the combined result. The coordinator owns shared `tidy` runs. Work relationships and assignments live in coordination records; the current CLI does not automatically aggregate children or enforce assignments.

## Explain design without accumulating a design corpus

For a meaningful change, Loom explains what happens now, what will change, what stays true, and why. That picture normally lives in the task conversation rather than a project-wide design-document graph.

- Working explanations serve the current task.
- PR and commit descriptions preserve the decisions and evidence from that change; they are historical records.
- Usage, external contracts, and verification procedures become living documents only when future readers rely on them.

Use the [execution-plan template](templates/execution-plan.md) when a multi-phase effort needs a file to coordinate or resume work. Use the [verification-recipe template](templates/verification-recipe.md) when a real user path needs a reusable check. Ordinary work needs neither.

## Carry context into later work

`work` recalls prior decisions, work state, and relevant records added since the last consolidation. At startup, task switches, and completion, `checkpoint` immediately saves the original goal, progress, and next actions. During work, the agent passes a short note and its actual source to `record`; the CLI assigns the record number and timestamp. Daily recording does not require rewriting a complete checkpoint or supplying graph links. It uses plain text through stdin, with no storage payload files or memory-file reviews. Current requests and project instructions take precedence.

`recall.unfinishedWorks` exposes unfinished work and its next actions separately from `unreviewedWorks`, which identifies records whose state needs review. After a short request and before a final response, the agent checks both lists and continues executable work within its current assignment. A temporary task switch does not complete or pause the original goal. Actual blockers, user pauses, and cancellations retain their states and reasons. Work from other conversations and live workers must be checked before resumption. The [unfinished-work protocol](skills/work/references/context.md#미완료-업무를-확인하고-재개한다) guides the agent's next action; the CLI does not launch background execution.

When the relevant work is not yet known, search original records using terms from the current objective, then compare the candidate work's current memories, graph, and pending records. Search rank and the latest revision of an original file do not establish which judgment applies now. Distinguish agreements, code observations, and proposals, and compare their work scope, observed code version, and execution conditions before selecting evidence. First and latest note excerpts help identify work that has not yet been consolidated.

Record the evidence and application conditions adopted for important decisions in a short note. At a completed work unit or before the next important decision based on that evidence, check the relevant work's current memories, graph, and new records for changes that affect the judgment. Rereading an immutable source reference does not reveal whether the current judgment has been superseded. Recall lists support limits and offsets, and an exact source reference reads only its own file. Memory and work-state entries in an apply response are limited to that request.

`tidy` reads an unprocessed batch, searches related originals with BM25, and applies the memory, work-state, entity, and statement changes justified by the evidence. Statement sources and inference premises preserve the basis for each relationship. Replacements take effect during tidy; old statements and original records are retained. Unresolved judgments retain their status and work-specific facts retain their scope. A successful apply advances the processed range together with the consolidated view; new arrivals remain pending. Its result report summarizes every actual change, including replacements, retirements, unresolved judgments, and follow-up work.

`graph` retrieves related statements, paths, and original evidence from an entity or text query. `recall` also returns graph context alongside pending originals. See the [graph contract](skills/work/references/context-graph.md) for statement construction, scope, and traversal limits. The agent interprets the evidence; the CLI validates and stores the relationships.

`recall` reports when consolidation is due: 20 pending originals or an oldest pending original at least 24 hours old. `work` checks at startup and stable work boundaries, including during a long-running conversation. Explicit `$loom:tidy` requests can run sooner. This is an invocation-time check; it does not install a background scheduler.

The [context script](scripts/context/cli.mjs) requires Node.js 20+ and Git, with no npm dependencies. Its default data root is `~/Library/Application Support/loom` on macOS, `%LOCALAPPDATA%\loom` on Windows, and `$XDG_DATA_HOME/loom` or `~/.local/share/loom` on Linux. Records live outside plugin installations and Git checkouts. Worktrees of the same local repository share them; separate clones and machines do not synchronize.

If the sandbox blocks writes to the storage path, the agent explains the actual path and storage purpose when requesting permission through the host's existing approval flow. Once approved, it retries the write at the same path and reads the result back to verify it.

Start recall through the [macOS/Linux launcher](scripts/context/cli.sh) or [Windows launcher](scripts/context/cli.cmd). Missing Node or Git produces a dependency error. The agent locates an existing executable or installs the dependency, verifies versions, and retries the original command. Git identifies the project shared by its worktrees.

Users can ask Loom to recall, revise, or forget a memory. The `location` command reports storage paths. An absolute `LOOM_DATA_DIR` or `--data-dir` overrides the data root. [Work context](skills/work/references/context.md) defines invocation, scopes, revisions, and failure behavior.

## Improve and check the skills

Use observed failures and omissions from real work to change the instructions or execution tools. Recheck the same conditions afterward. A structural check does not prove that a skill improves the agent's decisions or execution.

Repository scripts default to `.mjs`. Development tooling supports Node.js 22.x from 22.12, 24.x, or 26+. Development dependencies use the Yarn version pinned in `package.json`, with the `pnpm` node linker. Install them and set up the Git hooks once per clone:

```bash
yarn install --immutable
yarn hooks:install
```

Oxlint checks JavaScript, and Oxfmt formats source files, configuration, and Markdown. Historical records in `.loom/` are excluded. Lefthook runs repository-wide lint and format checks before each commit without modifying or staging files. Run `yarn lint:fix` and `yarn format` to apply fixes, then stage the changes you intend to commit.

Run the checks and tests explicitly:

```bash
yarn lint
yarn format:check
yarn check
yarn test
```

`yarn check` validates metadata, manifest consistency, and local file and heading references. `yarn test` runs the Vitest suite once, separately from the commit hook. Use `yarn test:watch` for watch mode or `yarn test scripts/context/records.test.mjs` for a single file. Changes to context CLI sources and launchers rerun the suite in watch mode, including tests that invoke separate Node processes.

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
