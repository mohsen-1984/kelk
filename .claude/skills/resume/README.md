# `/resume` — pick up a checkpointed session after a compact or clear

| | |
|---|---|
| **Current version** | 1.0 |
| **Status** | Stable. Used in a large multi-agent project before it was made generic |
| **Installs as** | `.claude/skills/resume/` (one project) or `~/.claude/skills/resume/` (all projects) |
| **Package** | [`dist/resume-skill.zip`](dist/resume-skill.zip) |
| **Requires** | A `Resume state` section written by [`/checkpoint`](../checkpoint/) in a plan file under `.claude/plans/` |

## What it does

`/resume` reads the notes that `/checkpoint` wrote and brings the work back in a safe order. It reconciles everything first, restarts things second, and lets the main session continue last.

1. **Reconciles the main note with the working tree.** It runs `git status` and `git diff`. Where the note and the tree disagree, the tree is the truth, and it says where the note was wrong.
2. **Reconciles each agent's state file** with that agent's tree. It also checks that each worktree still exists on its recorded branch, that no two agents claim the same unfinished file, and whether a note is marked *unconfirmed*.
3. **Gives a short brief**: what the main session and each agent did and will do next, and how each agent will come back. If anything disagreed, it stops here and lets the user decide.
4. **Restarts background processes in their recorded order**, waiting for each readiness check, with the recorded command, folder and environment. Then it **relaunches the agents in the order of their state files**:
   - first by messaging the stopped agent, which resumes it with its context;
   - if that fails, by respawning it with the original prompt plus its state file. A respawned worktree agent is pointed at its old worktree rather than given a new, empty one.
5. **Continues the main session.** It restores the to-do list from the note, doesn't redo finished items or reopen recorded decisions, doesn't retry rejected approaches, and doesn't touch files an agent owns.

## Install

```bash
mkdir -p .claude/skills && unzip resume-skill.zip -d .claude/skills      # one project
mkdir -p ~/.claude/skills && unzip resume-skill.zip -d ~/.claude/skills  # all projects
```

## Usage

```text
/resume                     # the plan with the newest Resume state section
/resume phase-3-billing     # a named plan file
```

Invoked only by the user (`disable-model-invocation: true`). Its `allowed-tools` pre-approves only reading; restarting processes and agents goes through the normal permission prompts.

## Folder layout

| Path | Contents | In the zip |
|---|---|---|
| [`SKILL.md`](SKILL.md) | The procedure (five steps) | Yes |
| [`README.md`](README.md) | This file | Yes |
| [`dist/`](dist/) | The packaged skill | No |

## Version history

| Version | Date | Changes |
|---|---|---|
| **1.0** | 2026-10-11 | Moved here from the candidate skills after review. Project-specific examples (a secrets manager, an IPv6 flag) were replaced with neutral ones; the procedure itself is unchanged. |

## Open items

- A respawned agent continues from its notes, not its memory. That is the limit of any checkpoint, and the brief says which agents were respawned.
- No automated test; the procedure was proven in use, not by a fixture.
