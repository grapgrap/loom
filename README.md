# loom

A Claude Code plugin that turns requirements into designs, and designs into actionable plans.

[English](README.md) [한국어](README.ko.md)

## Why

When building software, we already follow a natural flow.
Refining requirements, making plans, implementing, and looking back. loom structures this flow to make it reproducible.

The artifacts from a structured flow (design documents, decision records, principles) should remain valid over time.
loom maintains feedback loops that keep these artifacts alive alongside the code.

## Workflow

loom operates through four skills.

### Work Flow

**shape** → **plan** → implement

- **shape**: Refines ambiguous requirements to the design level. Covers approach strategies, constraints, and trade-offs, producing concepts and decisions.
- **plan**: Breaks down shape's output into executable tasks with dependencies.

### Feedback Loops

- **review**: Session-scoped verification. Checks whether the implementation meets the design, and accumulates learnings.
- **calibrate**: Corrects accumulated drift. When concepts and code diverge over time, it realigns documentation to the current state.

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

### Principle

Beliefs grounded in repeated experience that serve as the basis for judgment.
Not rules, but grounds — when people share the same principle, they arrive at the same judgment.
The only entity that spans both user scope and project scope.

### Plan

Documents that structure designs into executable tasks and dependencies.
Breaks down shape's output into implementation units and tracks progress.

### Scope

A system that determines priority among entities when multiple `.loom/` layers exist.
There is a user scope (`~/.claude/.loom/`) and project scope (`.loom/`), where the nearest scope takes precedence.

## Getting Started

### Installation

Install as a Claude Code plugin.

```bash
claude plugin add grapgrap/loom
```

### First Use

When you have a requirement that needs design, start with shape.

```
/loom:shape I want to add user authentication
```

Once shape is complete, it will guide you on whether to proceed with plan or implement directly.

After implementation, verify with review.

```
/loom:review
```

When you sense drift between documentation and code over time, correct it with calibrate.

```
/loom:calibrate
```
