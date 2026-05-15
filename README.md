# loom

A plugin that turns requirements into designs, and designs into implementation.
Works with Claude Code and OpenAI Codex CLI — both consume the same `SKILL.md` files.

[English](README.md) [한국어](README.ko.md)

## Why

When building software, we already follow a natural flow.
Refining requirements, making plans, implementing, and looking back. loom structures this flow to make it reproducible.

The artifacts from a structured flow (design documents, decision records, rules) should remain valid over time.
loom maintains feedback loops that keep these artifacts alive alongside the code.

## Workflow

loom operates through five skills.

### Work Flow

**shape** -> **plan** -> **task** -> implement

- **shape**: Refines ambiguous requirements to the design level. Covers approach strategies, constraints, and trade-offs. Produces concepts, decisions, and retention decisions when preconditions or constraints shift but the existing design is kept.
- **plan**: Breaks down shape's output into executable tasks with dependencies.
- **task**: Implements plan tasks through execution agreement with the user. Presents a direction draft, discusses it, then writes code.

### Feedback Loops

- **review**: Session-scoped verification. Checks whether the implementation meets the design, and accumulates learnings.
- **calibrate**: Detects accumulated drift. When preconditions or constraints have shifted or concepts and code have diverged, it reports findings and hands redesign back to shape.

## Components

loom manages five entities in the `.loom/` directory.

### Concept

Persistent documents that define the project's domain entities.
They describe "what this system deals with," focusing on the domain rather than implementation.
They serve as the project's ubiquitous language.

### Decision

Records the context behind decisions that shaped a concept's form.
Preserves why something was decided, providing grounds for future re-evaluation.
Each decision is independent and self-contained.
Retention decisions capture why existing concepts or decisions are kept when their preconditions or constraints have shifted.

### Rule

A non-functional requirement specific to this project that must always be observed.
The heavier end of the enforcement axis -- automatically referenced by shape·plan·task and reflected in their outputs.

### Convention

A preferred form that is strongly recommended but replaceable.
Covers agreed-upon unification of expression, structure, and tools -- the lighter end of the enforcement axis.

### Plan

Documents that structure designs into executable tasks and dependencies.
Breaks down shape's output into implementation units and tracks progress.

## Getting Started

### Prerequisites

- [aeira](https://github.com/grapgrap/aeira) -- `npm install -g @grapgrap/aeira`

### Installation

**Claude Code** — install as a plugin.

```bash
claude plugin add grapgrap/loom
```

**OpenAI Codex CLI** — clone the repo and run the installer. It creates symlinks under `~/.agents/skills/loom-*` pointing at this checkout. Re-run after `git pull` to update. Pass `--remove` to uninstall.

```bash
git clone https://github.com/grapgrap/loom ~/.loom
bash ~/.loom/scripts/install-codex.sh
```

For project-scope install instead, copy or symlink `skills/*` into your project's `.agents/skills/`. Codex discovers `.agents/skills/` from the current directory up to the repo root.

### First Use

When you have a requirement that needs design, start with shape.

Claude Code:

```
/loom:shape I want to add user authentication
```

Codex (mention the skill with `$`):

```
$shape I want to add user authentication
```

Once shape is complete, it will guide you on whether to proceed with plan or implement directly.

Once plan is complete, execute tasks with task.

```
/loom:task        # Claude Code
$task             # Codex
```

After implementation, verify with review.

```
/loom:review      # Claude Code
$review           # Codex
```

When you sense drift between documentation and code over time, correct it with calibrate.

```
/loom:calibrate   # Claude Code
$calibrate        # Codex
```
