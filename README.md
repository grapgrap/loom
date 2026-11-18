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

| Skill                                            | Responsibility                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| [`$loom:work`](skills/work/SKILL.md)             | Set completion criteria and choose the next skill.                             |
| [`$loom:understand`](skills/understand/SKILL.md) | Trace current behavior through code and execution evidence.                    |
| [`$loom:explorer`](skills/explorer/SKILL.md)     | Find reference implementations and compare their assumptions.                  |
| [`$loom:architect`](skills/architect/SKILL.md)   | Derive domain rules from scenarios and diagram responsibilities and contracts. |
| [`$loom:implement`](skills/implement/SKILL.md)   | Implement and verify one scenario at a time with Red → Green → Refactor.       |
| [`$loom:review`](skills/review/SKILL.md)         | Check design and implementation claims against counterexamples.                |
| [`$loom:write`](skills/write/SKILL.md)           | Write and edit explanations and documents for their audience.                  |

## Migrating from 2.x

Update reference research calls from `$loom:explore` to `$loom:explorer`. Start behavior changes with `$loom:work`. `$loom:architect` establishes the contract and `$loom:implement` owns implementation and verification. Use `$loom:understand` for reproduction-only requests. Version 3.0 removes the standalone `$loom:verify`, `$loom:coordinate` and `$loom:orchestrate` skills.
