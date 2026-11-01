#!/usr/bin/env bash
# Stop hook — warn when the context window passes a threshold, so /checkpoint can be
# run deliberately instead of being discovered at compaction time.
#
# WHY THIS EXISTS, given the status line already shows the same number: the status
# line is a terminal-UI feature and renders nothing in the VS Code extension's
# graphical panel (see README's Claude Code Configuration table). This hook is the
# panel's substitute — it works in every environment, because a hook is just a
# process reading stdin.
#
# WHERE THE NUMBER COMES FROM: hooks receive `transcript_path`, and every assistant
# turn in that JSONL carries the API response's own `usage` object. The context size
# is input_tokens + cache_creation_input_tokens + cache_read_input_tokens from the
# LAST such record — the same figure /context reports, not an estimate from file size.
#
# WHAT IT CANNOT KNOW: the transcript carries no context_window_size, so there is no
# way to compute a percentage here. WARN_TOKENS is therefore absolute. Run /context
# once, read the denominator, and set it to whatever fraction of that you want.
#
# THE DENOMINATOR IS NOW KNOWN, so that recalibration has been done once (2026-08-10):
# /context reports a 1.0M window on claude-opus-5, measured across four stages of the
# token-cost optimization plan. The original 150,000 was chosen before any such reading
# existed and had become 15% of the window, firing ~21 times before auto-compaction —
# which, with autoCompactWindow deliberately unset, does not fire until the model's own
# limit. 250,000 was the user's provisional retune: 25% of the window, ~16 possible
# warnings. Re-read the denominator and revisit this if the model or its window changes.
#
# THE THRESHOLD IS A FLOOR SAMPLED ONCE PER TURN, NOT A TRIPWIRE (2026-08-23). This is a
# Stop hook, so it looks exactly once per assistant response — never between tool calls.
# On this repo's agentic units a single turn routinely spends tens of thousands of tokens,
# so the crossing is discovered late by however much that turn consumed. Measured on unit
# 7a: context ran 205k -> 279k inside ONE turn, sailed past 250,000 without the hook ever
# getting a look, and the warning finally landed at 295,652 -- 45k late. Two consequences
# worth knowing before touching this number again:
#   - WARN_TOKENS must leave a whole big turn's worth of headroom under the point you
#     actually want to hear about. 200,000 is the user's call (2026-08-23) and buys ~75k
#     of that, which is what 7a's worst turn cost.
#   - An INTERRUPTED turn fires no Stop hook at all -- and interrupting a long turn is
#     precisely when context is growing fastest. 7a's big turn was cancelled by a
#     /checkpoint, so even its end was never sampled.
# Registering this same script on PostToolUse would sample mid-turn and remove both gaps;
# the debounce below already tolerates the higher call rate. Not done: it would run on
# every tool call in the session to catch one crossing.

set -u

# Warn from this many tokens of context onward, then again after each further
# RE_WARN_EVERY tokens. Absolute counts, not percentages — see the note above.
WARN_TOKENS=250000
RE_WARN_EVERY=50000

input=$(cat)

# JSON-escaped Windows paths arrive as C:\\Users\\... — normalise to forward slashes.
jstr() {
  printf '%s' "$input" | grep -o "\"$1\":[[:space:]]*\"[^\"]*\"" | head -1 | sed 's/.*"\([^"]*\)"$/\1/'
}
transcript=$(jstr transcript_path); transcript=${transcript//\\\\//}; transcript=${transcript//\\//}
session=$(jstr session_id)

[ -n "$transcript" ] && [ -f "$transcript" ] || exit 0

# The last line carrying a usage record is the most recent API response. Reading the
# tail rather than the whole file keeps this cheap on a multi-megabyte transcript.
last=$(tail -400 "$transcript" | grep '"cache_read_input_tokens"' | tail -1)
[ -n "$last" ] || exit 0

field() { printf '%s' "$last" | grep -o "\"$1\":[0-9][0-9]*" | tail -1 | cut -d: -f2; }
inp=$(field input_tokens);                 inp=${inp:-0}
cc=$(field cache_creation_input_tokens);   cc=${cc:-0}
cr=$(field cache_read_input_tokens);       cr=${cr:-0}

total=$(( inp + cc + cr ))
[ "$total" -ge "$WARN_TOKENS" ] || exit 0

# Debounce, or this fires on every single turn once the threshold is passed. The
# marker records the session and the total at the last warning; a new session starts
# clean, and within a session the reminder repeats only after real further growth.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || true
marker=".git/context_warn_ack"
[ -d .git ] || marker="${TMPDIR:-/tmp}/claude_context_warn_ack"

prev_session=""
prev_total=0
if [ -f "$marker" ]; then
  prev_session=$(head -1 "$marker" 2>/dev/null)
  prev_total=$(sed -n '2p' "$marker" 2>/dev/null)
  case "$prev_total" in (*[!0-9]*|"") prev_total=0 ;; esac
fi

if [ "$prev_session" = "$session" ] && [ "$(( total - prev_total ))" -lt "$RE_WARN_EVERY" ]; then
  exit 0
fi

printf '%s\n%s\n' "$session" "$total" > "$marker" 2>/dev/null

dirty=""
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  [ -n "$(git status --porcelain 2>/dev/null)" ] && dirty="yes"
fi

k=$(( total / 1000 ))
{
  echo "Context is at ~${k}k tokens (threshold ${WARN_TOKENS} in .claude/hooks/context-watch.sh)."
  echo
  if [ -n "$dirty" ]; then
    echo "The working tree is dirty, so there is mid-phase state that exists nowhere but"
    echo "this conversation. Tell the user the current figure and offer to run /checkpoint"
    echo "before continuing — do not run it yourself; it is theirs to trigger."
  else
    echo "The working tree is clean, so the commits and the plan already hold the state."
    echo "Mention the figure to the user, note that no checkpoint is needed right now,"
    echo "and carry on."
  fi
} >&2
exit 2
