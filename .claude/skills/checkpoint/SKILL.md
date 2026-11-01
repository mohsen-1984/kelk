---
name: checkpoint
description: Halt the main session and every subagent it spawned at a safe point, and write a resume note for each — the main one into the plan file, one state file per agent — before compacting or clearing context.
argument-hint: "[plan-file-name] (optional; defaults to the most recently modified plan)"
disable-model-invocation: true
allowed-tools: Bash(git status *) Bash(git diff *) Bash(git log *) Read ListAgents
---

Checkpoint before a compact or clear — halt everything, then write a resume note for the main
session and one for each agent. Change no code.

Target plan: $ARGUMENTS

If that is empty, use the most recently modified file in `.claude/plans/` and say which
one you picked before writing anything.

## Why the order below matters

A checkpoint is only true if nothing moves while it is being written. An agent still editing
while its state is recorded leaves a note that describes a tree that no longer exists, and
`/resume` then reconciles against the wrong baseline. So the sequence is: **freeze the main
session → quiesce each agent → collect each agent's state → stop the agents and background
processes → write the files → write the main note last.** The main note goes last because it
holds the manifest, and the manifest must list only state files that are already on disk.

## Step 1 — Freeze the main session

From this point on, make no edits, start no agents and send no new work to any agent other than
the messages below. Note which item of your checklist was in progress and how far it got — that
is what the main note records in Step 6.

## Step 2 — Inventory what is running

Run `ListAgents`, and list the background tasks this session started (shells started with
`run_in_background`, `Monitor` watches). Record for each **agent**:

- its address: the name it was spawned with, else the raw `agentId` from its spawn result;
- how it was spawned: `subagent_type`, `model` (if overridden), `isolation` (`worktree` or none),
  background or not, and **the original task prompt verbatim** — a respawn needs it word for word;
- if it runs in a worktree: the absolute worktree path, its branch, and its `HEAD`;
- its state now: running, idle waiting on something, or finished with a report not yet acted on;
- what it depends on and what depends on it — "waits for X's result", "feeds Y" — this is
  what `/resume` orders the relaunch by.

And for each **background process**: the exact command, its working directory and environment
(e.g. a variable the process needs in order to start), what it is for, the port it holds, and how to tell it
is ready. **Order matters here too:** a service must be up before anything that depends on it — for
example a secrets or database service before the API, and the API before the front end that calls it.

Only agents and processes **this session started** are in scope. Other Claude sessions that
`ListAgents` shows — a separate terminal, a cloud session — belong to the user; never halt them.

If no agents and no background processes exist, skip to Step 6: this is the single-session
checkpoint and nothing else applies.

## Step 3 — Quiesce each agent and collect its state

Send each running or idle agent this through `SendMessage` (one message per agent, all sent
before waiting on any, so they halt together):

> CHECKPOINT — stop at the next safe point. Finish the edit you are in the middle of only if
> leaving it half-written would break the file; otherwise stop now. Start nothing new. Then
> reply to main via SendMessage with your state, under exactly these headings:
> 1. **Task** — one line: what you were asked to do.
> 2. **Done** — files you modified, and for each, complete or partial and what is missing.
> 3. **Next** — the remaining work as an ordered checklist, specific enough to act on without
>    re-deriving the design. Put the exact next action first.
> 4. **Rejected** — approaches you tried and dropped, each with the reason.
> 5. **Measurements** — probe output, command results, ids, line numbers the rest depends on.
> 6. **Corrections** — anything main or the user told you mid-task that is not in your prompt.
> 7. **In flight** — anything you sent main that has not been answered, or are waiting on.
> Write no files for this. Reply, then stop and wait.

**Agents reply by message, not by writing files** — an agent in a worktree would write its file
into its own checkout, where neither the main tree nor `/resume` would find it. Main writes every
file in Step 5.

Wait for every reply. A reply arrives as a notification; do not poll `ListAgents` in a loop.
An agent that finished before the checkpoint has no state to report — record its final report
instead, marked `finished, report not yet acted on` if main had not used it.

**If an agent does not answer** once every other agent has, tell the user which one and ask
before going further. On their go-ahead, stop it and write its state from the outside: its
`git -C <worktree> status` / `git diff`, its task prompt, and what main last knew. Mark the file
**`unconfirmed — reconstructed outside the agent`** and write `unknown` under Rejected and
Corrections. Never fill those two from guesswork: an invented rejected approach is worse than a
missing one, because `/resume` obeys it.

## Step 4 — Stop the agents, then the background processes

For each agent whose state is now recorded, `TaskStop` it by name or `agentId`. A stopped agent
can still be sent a message later — a send resumes it from its transcript, with its context —
which is what `/resume` tries first.

Then stop each background process, after its command and readiness check are written down.
Stop them in the **reverse** of their start order — the front end, then the API, then the
services it depends on — so nothing is left calling a dependency that has already gone.

## Step 5 — Write one state file per agent

Into `.claude/plans/checkpoints/<plan-stem>/`, where `<plan-stem>` is the plan's file name without
`.md`, write `<order>-<agent-name-or-id>.md` per agent, with `<order>` a two-digit relaunch position
(`01`, `02`, …) taken from the dependency order in Step 2: an agent comes after every agent it waits
on, and ties keep the order they were spawned in.

Each file holds the spawn record from Step 2 (address, `subagent_type`, model, isolation, worktree
path / branch / `HEAD`, background flag, dependencies, the verbatim task prompt in a fenced block),
then the agent's reply from Step 3 unedited, under a `## State at halt — <today's date>` heading.
Then compare that reply with the agent's tree (`git -C <worktree> status` and `git diff`, or the
main tree when it had no worktree) and add a **Discrepancies** line: `none`, or where the reply and
the tree disagree. Write that down; do not correct the reply.

## Step 6 — Write the main note, last

Ground yourself in the working tree, not in memory: run `git status` and `git diff` and read what
is actually there.

Then write a `### Resume state — <today's date>` section into the plan file, under the phase
currently in progress, covering exactly these five things:

1. **Files already modified in this phase**, and for each, how far it got — complete, or
   partial and what is missing.
2. **The remaining work as an ordered checklist**, specific enough to act on without
   re-deriving the design. Include the main session's own checklist as it stood at Step 1,
   with its progress markers — the `TodoWrite` list does not survive a `/clear`.
3. **Approaches tried and rejected during this phase, with the reason.** These are
   invisible in the diff and will otherwise be retried.
4. **Any measurement, probe output, command result or id the remaining work depends on** —
   viewport widths, `scrollWidth`/`clientWidth` pairs, test output, sample ids.
5. **Decisions or corrections made in this session** that are not yet in the plan, in
   CLAUDE.md, or in a commit message.

When Step 2 found agents or processes, add two more, in this order:

6. **Agents at halt** — a table: relaunch order · address · `subagent_type` / model · isolation and
   worktree path · state at halt · depends on · state file (relative link). Say explicitly which
   files are marked `unconfirmed`.
7. **Background processes at halt** — a table: start order · command · working directory and
   environment · purpose · port · readiness check.

Sections 3 and 5 — the main note's and each agent's — are the ones that justify this skill.
Everything else is recoverable from the diffs; those exist nowhere but the conversations.

## Rules

No code changes, no commits, no README rows, no CLAUDE.md edits. Do not summarize the
conversation — write only what is needed to finish this phase. If anything in the plan's
original description has turned out to be wrong, say so explicitly rather than quietly writing
around it.

Finish by telling the user what was halted (agents, processes) and where each note was written,
so they can see the session is quiet before they `/compact` or `/clear`.

When the phase eventually lands, the `Resume state` section is collapsed into the phase's
completion record or deleted, **and `.claude/plans/checkpoints/<plan-stem>/` is deleted with
it** — when plans are committed to the repository, a stale in-progress note left behind makes the plan
read as intent plus debris.
