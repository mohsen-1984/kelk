#!/usr/bin/env bash
# SessionStart hook (no matcher - every source): say out loud that a /checkpoint note
# is waiting, when one is.
#
# WHY THIS EXISTS. /checkpoint writes a "### Resume state" section into the in-progress
# plan file, and /resume reads it back. The write half is prompted twice over -- the
# PreCompact guard blocks and names it, context-watch.sh offers it at a threshold -- but
# NOTHING prompted the read half. A fresh session after /clear or a compact begins with
# root CLAUDE.md re-injected and no idea that a note was written for it minutes ago.
#
# The /clear case was the uncovered one and it is the case /checkpoint was built for:
# PreCompact fires only on compaction, so clearing mid-phase produced a note that
# nothing ever pointed at again.
#
# WHAT IS AUTOMATED AND WHAT IS NOT. Only the *discovery* half. Finding which plan holds
# the freshest note is mechanical, so a hook does it; reconciling that note against
# `git status`/`git diff` -- with the working tree as the truth -- is judgement, and stays
# in the /resume skill. A hook cannot make Claude do that, and should not pretend to.
#
# SILENT BY DEFAULT, which is the whole reason it can run unmatched on every source:
#   clean tree   -> exit 0  (the phase landed; commits and the plan hold the state, and
#                            a note left behind after a landing is stale by definition)
#   no note      -> exit 0  (nothing to resume)
# So it speaks only in the situation it exists for, and adds nothing to the top of an
# ordinary session.
#
# stdout from a SessionStart hook is added to Claude's context (code.claude.com/docs/en/hooks,
# re-verified 2026-08-10: SessionStart, UserPromptSubmit and UserPromptExpansion are the
# only events whose stdout Claude sees; PostCompact's does not, which is why this is not a
# PostCompact hook).

set -u

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

command -v git >/dev/null 2>&1 || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

# Clean tree: nothing mid-phase, so any note present has already been superseded.
[ -n "$(git status --porcelain 2>/dev/null)" ] || exit 0

[ -d .claude/plans ] || exit 0

# Newest plan file carrying a Resume state section. Test the captured OUTPUT, not the
# pipeline's exit status -- `xargs -r` exits 0 on empty input, the same trap the
# PreCompact guard documents.
plan=$(ls -t .claude/plans/*.md 2>/dev/null |
       while IFS= read -r f; do
         grep -q '^#\{1,6\}[[:space:]]*Resume state' "$f" 2>/dev/null && { printf '%s' "$f"; break; }
       done)
[ -n "$plan" ] || exit 0

# The heading itself carries the date /checkpoint stamped, which is how a stale note
# announces itself rather than being taken at face value.
heading=$(grep -m1 '^#\{1,6\}[[:space:]]*Resume state' "$plan" 2>/dev/null | sed 's/^#*[[:space:]]*//')

# A multi-agent checkpoint (2026-10-05) also leaves one state file per halted subagent in
# .claude/plans/checkpoints/<plan-stem>/. Name them, because those agents are not running
# now and nothing else says they existed -- a /resume that skipped them would continue the
# main session alone and leave their half of the phase unfinished.
stem=$(basename "$plan" .md)
agent_dir=".claude/plans/checkpoints/${stem}"
agent_count=0
if [ -d "$agent_dir" ]; then
  agent_count=$(find "$agent_dir" -maxdepth 1 -name '*.md' 2>/dev/null | wc -l | tr -d ' ')
fi

cat <<EOF
A /checkpoint note is waiting: "${heading}" in ${plan}, and the working tree is dirty.

That section holds the two things a compact or a /clear drops entirely -- the approaches
already tried and rejected this phase, and any correction given in the session that wrote
it. Run /resume before continuing the phase; it reconciles the note against git status /
git diff, and where they disagree the working tree is the truth.

If the phase has in fact landed and this note is leftover, say so and clear it from the
plan rather than resuming against it.
EOF

if [ "$agent_count" -gt 0 ]; then
  cat <<EOF

The checkpoint also halted ${agent_count} subagent(s); their state files are in ${agent_dir}/.
They are not running now. /resume reconciles each against its own worktree and relaunches
them in the recorded order -- do not continue the main session ahead of that.
EOF
fi
exit 0
