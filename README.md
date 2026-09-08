# loom

A Claude Code and Codex plugin that turns requirements into designs, and designs into implementation.

[English](README.md) [한국어](README.ko.md)

## Why

When building software, we already follow a natural flow.
Refining requirements, making plans, implementing, and looking back. loom structures this flow to make it reproducible.

The artifacts from a structured flow (design documents, decision records, rules) should remain valid over time.
loom maintains feedback loops that keep these artifacts alive alongside the code.

## Workflow

loom operates through propose, which raises a problem, and a five-step loop for design, execution, and feedback.

### Proposal

**propose** -> **shape** when adopted

- **propose**: Writes a self-contained proposal that raises a problem and its solution direction in the project's shared vocabulary. It creates no other loom documents and shares the proposal with the team for confirmation. Once adopted, it grounds the design that follows.

### Work Flow

**shape** -> **plan** -> **task** -> implement

- **shape**: Refines ambiguous requirements to the design level. Covers approach strategies, constraints, and trade-offs. Produces concepts and flows, along with decisions -- including retention decisions when preconditions or constraints shift but the existing design is kept.
- **plan**: Clarifies the problem and desired outcome, then investigates the current implementation. It proposes an implementation draft covering code structure, key interfaces, and core logic, and reviews each part and its effects with the user. It derives tasks, completion outcomes, and verification methods from the reviewed changes. An outcome dependency exists only when one outcome is a prerequisite for another task.
- **task**: Checks whether the implementation draft fits the current code and preceding work. It agrees on the concrete application, necessary adjustments, and verification methods with the user before implementing. It marks the task complete only after verifying the outcome. If a discovery changes a major judgment or a prerequisite for later work, it revisits the affected change plan and tasks with the user.

### Feedback Loops

- **review**: Adversarially reviews outputs in the same session. Session context identifies the scope, while raw files, diffs, and recorded agreements justify the findings. For a plan, it checks the code evidence for current behavior, whether the implementation approach solves the problem, how side effects are addressed, and whether the tasks implement the proposed changes. Runs after any step -- shape, plan, or task -- not only after implementation.
- **calibrate**: Audits whether the purposes of accumulated concepts and flows still align with the project's goals. It reports findings without correcting them directly, leaving the decision to re-enter shape to the user.

## Document Quality

loom bundles a document authoring guide for the documents it creates.
The guide defines each document type's responsibility, routes content to the type that owns it, treats wiki links as structural relationships, and provides language-neutral technical writing criteria.

shape, plan, and task load the guide before changing Loom documents and validate their changed documents against it when writing is complete.
review applies the same guide when its confirmed scope contains Loom documents, without expanding that scope into a full `.loom/` audit.
calibrate remains focused on purpose alignment and does not apply the guide.

Templates provide document structure and minimal section prompts.
They do not duplicate the cross-document judgments owned by the guide.

## Components

loom manages seven entities in the `.loom/` directory.

### Concept

Persistent documents that define the project's domains at the invariant level.
They describe "what this system deals with," focusing on the domain rather than implementation.
They serve as the project's ubiquitous language.

### Flow

Persistent documents that describe the orchestration that calls and composes multiple domains.
Where a concept defines a domain (decomposition), a flow calls and composes those domains (composition). Both live at the same invariant level.
One question tells them apart -- if it calls and composes multiple domains it is a flow; if it is behavior within a single domain, or a computation that closes many inputs into one result, it is a concept. Composition takes many forms: sequence, parallelism, branching, feedback. Nameability is not the criterion, and orchestration is never absorbed into a concept -- it stays in the flow. A flow stays at the invariant level; control detail goes to code.

### Decision

Records the context behind decisions that shaped a concept's or flow's form.
Preserves why something was decided, providing grounds for future re-evaluation.
Each decision is self-contained and append-only: old ones are never rewritten, and even when it references another it can be understood without the referenced one.
Retention decisions capture why existing concepts or decisions are kept when their preconditions or constraints have shifted.

### Proposal

A self-contained document that raises a problem and its solution direction in the project's shared vocabulary, before anything is committed to a persistent document.
It is shared with the team for confirmation and references no loom documents, so it stands on its own. Once adopted, it grounds the design that follows; either way, it stays on file.

### Rule

A non-functional requirement specific to this project that must always be observed.
The heavier end of the enforcement axis -- automatically referenced by shape·plan·task and reflected in their outputs.

### Convention

A preferred form that is strongly recommended but replaceable.
Covers agreed-upon unification of expression, structure, and tools -- the lighter end of the enforcement axis.

### Plan

A document that describes the problem, desired outcome, and findings from investigating the current implementation. It reviews the implementation approach and its effects with the user, derives execution tasks, and stays current during execution.
The current implementation is examined to understand the problem and assess the effects of change. Whether to retain its structure is judged against the problem and desired outcome.
It retains current behavior, the reviewed implementation draft, expected effects, and unresolved questions needed for judgment and execution. Work with unresolved code structure or core behavior is not finalized as ready for implementation. Even a single task can warrant a plan when its effects need review.
Each task states its purpose, the change it will make, its completion outcome, and its verification method. An outcome dependency exists only when one task's outcome is a prerequisite for another task.
Progress is updated on each task. If an execution discovery affects the remaining execution path, task updates the affected change plan, task, or outcome dependency instead of appending the discovery to a chronological global progress context. Task adds a temporary handoff to the current incomplete task only when the user explicitly requests it. Task removes the handoff when execution resumes or the task is complete.

## Getting Started

### Prerequisites

- [aeira](https://github.com/grapgrap/aeira) -- `npm install -g @grapgrap/aeira`

### Installation

#### Claude Code

```bash
claude plugin marketplace add grapgrap/loom
claude plugin install loom@loom-marketplace
```

#### Codex

```bash
codex plugin marketplace add grapgrap/loom
codex plugin add loom@loom-marketplace
```

Start a new Claude Code or Codex session after installation so the bundled skills are available.

### First Use

To align on a problem and direction with the team first, raise it with propose. Once a proposal is confirmed and adopted, it grounds the shape that follows.

```text
/loom:propose I want to revisit our payment retry policy
$loom:propose I want to revisit our payment retry policy
```

When you have a requirement that needs design, start with shape. Claude Code uses `/loom:skill`; Codex CLI and IDE use `$loom:skill` for explicit invocation. In the ChatGPT desktop app, choose Loom or one of its bundled skills with `@`.

```text
/loom:shape I want to add user authentication
$loom:shape I want to add user authentication
```

Once shape is complete, it will guide you on whether to proceed with plan or implement directly.

Once plan is complete, execute tasks with task.

```text
/loom:task
$loom:task
```

After shape, plan, or task, run review in the same session so it can identify the actual work from the session history. The findings must still be justified from raw artifacts rather than conversational intent.

```text
/loom:review
$loom:review
```

For a stronger independent audit, start another session and provide an explicit commit, range, patch, or artifact scope. Do not rely on worktree status alone to reconstruct an earlier session.

When you sense that accumulated designs may have drifted from the project's goals, audit with calibrate.

```text
/loom:calibrate
$loom:calibrate
```
