# loom

A Claude Code plugin that turns requirements into designs, and designs into implementation.

[English](README.md) [한국어](README.ko.md)

## Why

When building software, we already follow a natural flow.
Refining requirements, making plans, implementing, and looking back. loom structures this flow to make it reproducible.

The artifacts from a structured flow (design documents, decision records, principles) should remain valid over time.
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

loom manages six entities in the `.loom/` directory.

### Concept

Persistent documents that define the project's domain entities.
They describe "what this system deals with," focusing on the domain rather than implementation.
They serve as the project's ubiquitous language.

### Decision

Records the context behind decisions that shaped a concept's form.
Preserves why something was decided, providing grounds for future re-evaluation.
Each decision is independent and self-contained.
Retention decisions capture why existing concepts or decisions are kept when their preconditions or constraints have shifted.

### Principle

Beliefs grounded in repeated experience that serve as the basis for judgment.
Not rules, but grounds -- when people share the same principle, they arrive at the same judgment.
The foundational layer of thought, applicable beyond any specific domain.

### Rule

A condition-action mapping where a principle is applied within a specific domain.
"In this situation, do this" -- the form a principle takes when its scope is bounded.

### Convention

An agreed-upon unification of expression.
Form-level consistency where what matters is the agreement itself, not absolute justification.

### Plan

Documents that structure designs into executable tasks and dependencies.
Breaks down shape's output into implementation units and tracks progress.

## Getting Started

### Prerequisites

- [aeira](https://github.com/grapgrap/aeira) -- `npm install -g @grapgrap/aeira`

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

Once plan is complete, execute tasks with task.

```
/loom:task
```

After implementation, verify with review.

```
/loom:review
```

When you sense drift between documentation and code over time, correct it with calibrate.

```
/loom:calibrate
```
