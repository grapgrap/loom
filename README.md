# loom

A Claude Code plugin that turns requirements into designs, and designs into implementation.

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

- **shape**: Refines ambiguous requirements to the design level. Covers approach strategies, constraints, and trade-offs. Produces concepts and flows, along with decisions -- including retention decisions when preconditions or constraints shift but the existing design is kept.
- **plan**: Breaks down shape's output into executable tasks with dependencies, then verifies each task with the user before finalizing.
- **task**: Implements plan tasks through execution agreement with the user. Presents a direction draft, discusses it, then writes code. When a plan assumption conflicts with reality during the work, task updates the plan rather than forcing it through.

### Feedback Loops

- **review**: Delegates this session's output to a separate reviewer that critiques it without the bias of the conversation that produced it, then curates the findings by severity. Runs after any step -- shape, plan, or task -- not only after implementation.
- **calibrate**: Audits whether the purposes of accumulated concepts and flows still align with the project's goals. It reports findings without correcting them directly, leaving the decision to re-enter shape to the user.

## Components

loom manages six entities in the `.loom/` directory.

### Concept

Persistent documents that define the project's domain entities statically.
They describe "what this system deals with," focusing on the domain rather than implementation.
They serve as the project's ubiquitous language.

### Flow

Persistent documents that describe the path of a collaboration in which events cross domain boundaries.
Where a concept defines a domain as a node, a flow traces the path crossing those nodes -- both live on the same strategic layer.
A flow appears as a conditional axis only when such an event path actually exists. Being nameable does not make coordination a concept; coordination earns a concept of its own only when it holds state or rules of its own. Drawing a flow doubles as a lens that reveals the boundaries between domains.

### Decision

Records the context behind decisions that shaped a concept's or flow's form.
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

Living documents that structure designs into executable tasks and dependencies, kept alive across writing and execution.
Breaks down shape's output into implementation units, verifies each task with the user before finalizing, and tracks progress. During execution, task accumulates progress context -- handoffs and findings -- into the plan, so work carries across sessions without loss.

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

After implementation, review the output with review.

```
/loom:review
```

When you sense that accumulated designs may have drifted from the project's goals, audit with calibrate.

```
/loom:calibrate
```
