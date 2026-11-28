# Loom

Loom is a Claude Code and Codex plugin for software development. It organizes investigation, design and implementation around scenarios whose outcomes users can verify.

[English](README.md) | [한국어](README.ko.md)

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

## Skills

| Skill                                            | Responsibility                                                                               |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| [`$loom:work`](skills/work/SKILL.md)             | Set completion criteria, hand off unfinished work, and verify the outcome in code and tests. |
| [`$loom:understand`](skills/understand/SKILL.md) | Trace domain responsibilities and interactions through existing code.                        |
| [`$loom:diagnose`](skills/diagnose/SKILL.md)     | Reproduce reported symptoms and identify their causes.                                       |
| [`$loom:explorer`](skills/explorer/SKILL.md)     | Explore products, docs, and code to refine questions and compare approaches.                 |
| [`$loom:architect`](skills/architect/SKILL.md)   | Agree on designs by checking domain models with TypeScript and flows with TLA+ and TLC.      |
| [`$loom:implement`](skills/implement/SKILL.md)   | Implement and verify one scenario at a time with Red → Green → Refactor.                     |
| [`$loom:review`](skills/review/SKILL.md)         | Find missing or unjustified test expectations and trace who makes each decision in the code. |
| [`$loom:write`](skills/write/SKILL.md)           | Write and edit explanations and documents for their audience.                                |

The [cargo booking agreement (Korean)](examples/strategic-design-agreement.ko.md) connects the context map and business scenarios to both models and their verification results.

## Migrating from 2.x

Update reference research calls from `$loom:explore` to `$loom:explorer`. Start behavior changes with `$loom:work`. Use `$loom:diagnose` to reproduce or investigate a defect. When the cause is known, `$loom:implement` restores the existing contract. If the fix needs a new contract or a change in responsibilities, use `$loom:architect` first. Version 3.0 removes the standalone `$loom:verify`, `$loom:coordinate` and `$loom:orchestrate` skills.
