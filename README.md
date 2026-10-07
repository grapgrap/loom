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

| Skill | Responsibility |
| --- | --- |
| `work` | Own routing, implementation, cleanup, verification, and delivery within the goal and scope. |
| `understand` | Reconstruct the current picture from code, runtime evidence, and history. Direct invocation investigates and reports. |
| `architect` | Ground implementation and verification in usage examples, responsibilities, state, and interfaces. |
| `verify` | Judge finish conditions on the real artifact and user path as confirmed, failed, or inconclusive. |
| `review` | Find gaps in decisions and evidence through counterexamples, then check the findings themselves. |

Requests for explanation, design, verification, or review stay within that scope. Implementation and fixes follow the scope of the work entrusted to the agent.

Loom's [principles](references/principles.md) describe the domain responsibilities, contracts, and dependencies a change must preserve. Skills follow this shared document's application procedure to select relevant principles from the task's purpose and impact. Each principle includes application situations and examples. Subagents are not part of the default route.

## Explain design without accumulating a design corpus

For a meaningful change, Loom explains what happens now, what will change, what stays true, and why. That picture normally lives in the task conversation rather than a project-wide design-document graph.

- Working explanations serve the current task.
- PR and commit descriptions preserve the decisions and evidence from that change; they are historical records.
- Usage, external contracts, and verification procedures become living documents only when future readers rely on them.

Use the [execution-plan template](templates/execution-plan.md) when a multi-phase effort needs a file to coordinate or resume work. Use the [verification-recipe template](templates/verification-recipe.md) when a real user path needs a reusable check. Ordinary work needs neither.

## Improve and check the skills

Use observed failures and omissions from real work to change the instructions or execution tools. Recheck the same conditions afterward. A structural check does not prove that a skill improves the agent's decisions or execution.

Repository scripts default to `.mjs`. Development dependencies use the Yarn version pinned in `package.json`, with the `pnpm` node linker. Install them, then check metadata, manifest consistency, and local file and heading references:

```bash
yarn install --immutable
yarn check
```

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
$loom:architect Show the current ownership and proposed user experience first. Do not implement yet.
$loom:understand Explain how payment failures work now and why the system was shaped this way.
```

## Migrate from v1

V1's `propose`, `shape`, `plan`, `task`, and `calibrate` are not retained as command names. Use `work` for most changes, `understand` for the current design, and `architect` for design-only requests. `work` creates a multi-phase plan only when the task needs one. `review` remains available.

Existing `.loom/` project documents are neither deleted nor automatically converted. V2 can consult them as historical evidence, but does not impose a new obligation to keep them current.
