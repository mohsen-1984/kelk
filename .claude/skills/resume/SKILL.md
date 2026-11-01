---
name: resume
description: Resume a mid-phase plan after a compact or clear — reconcile the main resume note and every agent's state file against the working trees, then restart background processes and relaunch the agents in their recorded order before continuing the main session.
argument-hint: "[plan-file-name] (optional; defaults to the plan with the newest Resume state)"
disable-model-invocation: true
allowed-tools: Bash(git status *) Bash(git diff *) Bash(git log *) Read ListAgents
---

Resuming work after a compact or clear.

Target plan: $ARGUMENTS

If that is empty, find the plan in `.claude/plans/` carrying the most recent
`Resume state` section and say which one you picked.

## Why the order below matters

Everything is reconciled **before** anything is restarted, and the main session continues
**last**. An agent relaunched against an unreconciled note starts work on a tree it
misunderstands, and once two agents are running, a wrong note can no longer be corrected
cheaply. The main session waits until the agents are running again so that it does not take
over files an agent owns.

## Step 1 — Reconcile the main note. Edit nothing yet.

1. Read the `Resume state` section.
2. Run `git status` and `git diff`.
3. **Reconcile the two.** If they disagree, the working tree is the truth — say where the
   note was wrong rather than proceeding on it. A resume note is written from memory of
   intent; the diff is what actually happened, and mid-phase they drift.

If the section has no **Agents at halt** or **Background processes at halt** table, this was a
single-session checkpoint: skip to Step 5.

## Step 2 — Reconcile each agent's state file

For every row of **Agents at halt**, read its file under `.claude/plans/checkpoints/<plan-stem>/`
and check it against that agent's tree: `git -C <worktree> status` and `git diff` when it ran in a
worktree, the main tree otherwise. The tree is the truth here too. Also check:

- **The worktree still exists**, on the recorded branch, at or after the recorded `HEAD`. A missing
  worktree means that agent's uncommitted work is gone — stop and tell the user; do not respawn it
  against a fresh checkout as if nothing happened.
- **No two agents claim the same file** as unfinished work. If they do, the dependency order is
  wrong somewhere; ask the user before relaunching either.
- **The file's `Discrepancies` line**, and whether it is marked `unconfirmed`. An unconfirmed
  agent's `Rejected` and `Corrections` are `unknown`, not empty — say so in the brief.

## Step 3 — Brief, then wait if anything disagreed

State in a few sentences what the main session has done and does next, and per agent, one line:
what it finished, what it does next, and **how it will come back** (Step 4). That brief is the
cheapest check that the compact preserved what mattered — if it describes the phase wrongly, it is
caught before any code is written or any agent starts.

If Steps 1–2 found any disagreement, a missing worktree, a contested file or an unconfirmed agent,
**stop after the brief and let the user decide.** Otherwise continue.

## Step 4 — Restart processes, then relaunch agents, in the recorded order

**Background processes first**, in their recorded start order. Wait for each one's readiness check
before starting the next — a dependency answering before the service that needs it starts, the API
answering before anything that calls it. Use the recorded command, working directory and environment
exactly; a process restarted without an environment variable the note recorded fails the same way it
did the first time.

**Then the agents, in the order of their state files** (`01`, `02`, …). An agent whose recorded
dependency is another agent's *result* is relaunched only once that agent has delivered it. An
agent recorded as `finished, report not yet acted on` is not relaunched: use its recorded report.

For each agent, try to bring back the original before starting a new one:

1. **Same agent, context intact.** Send its address a `SendMessage` — a send to a stopped agent
   resumes it from its transcript. The message says: the checkpoint is over; here is your reconciled
   state (paste its `Next` list and any discrepancy from Step 2); continue from the first item of
   `Next`; do not redo `Done`, do not retry anything under `Rejected`.
2. **Respawn, only when the send fails** because the agent no longer exists (after a `/clear` or in
   a new session it usually will not). Call `Agent` with the recorded `subagent_type`, model and
   background flag, and a prompt made of the **verbatim original task prompt**, then the whole state
   file, then the same instructions as in 1. For an agent that ran in a worktree, **do not pass
   `isolation: "worktree"`** — that creates a new, empty worktree and leaves the work behind. Spawn it
   without isolation and tell it to work only inside the recorded worktree path, by absolute paths
   and `git -C <path>`.

Say in the brief which agents came back with their context and which were respawned. **A respawned
agent continues from its notes, not from its memory** — it has the task, the state file and the
tree, and nothing that was in its context and not written down. That is the limit of what a
checkpoint can carry; do not describe a respawn as the same agent.

## Step 5 — Continue the main session

Restore the main session's checklist from the note with `TodoWrite`, completed items marked done.
Do not redo completed items, do not reopen decisions the note records, and do not retry anything
in its rejected-approaches list. Do not edit a file a running agent lists as its unfinished work.
Then continue the phase.

When the phase lands, the `Resume state` section is collapsed or deleted and
`.claude/plans/checkpoints/<plan-stem>/` is deleted with it.
