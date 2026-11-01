# `/checkpoint` — freeze a session safely before compacting or clearing it

| | |
|---|---|
| **Current version** | 1.0 |
| **Status** | Stable. Used in a large multi-agent project before it was made generic |
| **Installs as** | `.claude/skills/checkpoint/` (one project) or `~/.claude/skills/checkpoint/` (all projects) |
| **Package** | [`dist/checkpoint-skill.zip`](dist/checkpoint-skill.zip) |
| **Requires** | A plan file in `.claude/plans/` that describes the work in phases |
| **Pairs with** | [`/resume`](../resume/), which reads what this skill writes |

## What it does

Before `/compact` or `/clear`, `/checkpoint` stops everything the session is doing at a safe point and writes down what is needed to carry on. It changes no code.

1. **Freezes the main session.** No more edits, agents or new work.
2. **Takes stock of what is running.** It records every subagent this session started (name or ID, type, model, isolation and worktree, the original prompt word for word, its state, its dependencies) and every background process (command, folder, environment, port, readiness check, start order). Sessions the user started elsewhere are never touched.
3. **Halts each agent and collects its state.** Agents reply by message under fixed headings: Task, Done, Next, Rejected, Measurements, Corrections, In flight. An agent that does not answer is only stopped with the user's consent, and its note is marked *unconfirmed*.
4. **Stops the agents, then the background processes**, in reverse start order.
5. **Writes one state file per agent** into `.claude/plans/checkpoints/<plan>/`, numbered in relaunch order, each with a *Discrepancies* line comparing the reply with the agent's working tree.
6. **Writes the main resume note last**, into the plan file under the current phase. It covers the files changed, the remaining checklist (the to-do list does not survive `/clear`), rejected approaches, measurements, and decisions not yet written down anywhere. When agents or processes were running, it adds the two halt tables.

The rejected approaches and the corrections are the point of the exercise: everything else can be recovered from the diff, but those exist only in the conversation.

## Install

```bash
mkdir -p .claude/skills && unzip checkpoint-skill.zip -d .claude/skills      # one project
mkdir -p ~/.claude/skills && unzip checkpoint-skill.zip -d ~/.claude/skills  # all projects
```

Install `/resume` next to it.

## Usage

```text
/checkpoint                     # uses the most recently modified plan in .claude/plans/
/checkpoint phase-3-billing     # a named plan file
```

Then run `/compact` or `/clear`, and afterwards `/resume`.

The skill is invoked only by the user (`disable-model-invocation: true`). Its `allowed-tools` pre-approves only reading (git status/diff/log, Read, ListAgents). Writing the notes, messaging agents (`SendMessage`) and stopping them (`TaskStop`) go through the normal permission prompts.

## Folder layout

| Path | Contents | In the zip |
|---|---|---|
| [`SKILL.md`](SKILL.md) | The procedure (six steps and the rules) | Yes |
| [`README.md`](README.md) | This file | Yes |
| [`dist/`](dist/) | The packaged skill | No |

## Version history

| Version | Date | Changes |
|---|---|---|
| **1.0** | 2026-10-11 | Moved here from the candidate skills after review. Project-specific examples (a secrets manager, a Blazor front end, an IPv6 flag) were replaced with neutral ones; the procedure itself is unchanged. |

## Open items

- The plan-file convention (`.claude/plans/*.md`, phases, a `Resume state` section) is assumed rather than created. A project without plans needs one before the first checkpoint.
- No automated test; the procedure was proven in use, not by a fixture.
