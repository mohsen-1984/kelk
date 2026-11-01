#!/usr/bin/env bash
# Stop hook — move a completed plan from .claude/plans/ into .claude/plans/archive/,
# and repoint every link to it, at the end of the turn that declared it complete.
#
# WHY THIS EXISTS (2026-10-05, user instruction): .claude/plans/ is split by state —
# the folder itself holds plans in progress or not yet started, archive/ holds the
# completed ones. A move nobody has to remember keeps that split honest; the folder
# then states a plan's state without being read. (Adopted in Kelk 1405-08-10.)
#
# THE TRIGGER IS ONE LINE IN THE PLAN, NOT A JUDGEMENT. A file is archived when one of
# its first 20 lines starts with
#     **Status: COMPLETE
# (the canonical form is `**Status: COMPLETE (YYYY-MM-DD).**`). Nothing else counts — prose like "the plan is complete"
# further down is not looked for, so a half-finished plan quoting that phrase is safe.
# Only top-level files are considered: archive/ and checkpoints/ are never scanned.
#
# WHAT A MOVE DOES, in order:
#   1. `git mv` (plain `mv` for an untracked plan) into archive/. An existing file of
#      the same name in archive/ is never overwritten — that plan is skipped and named.
#   2. Inside the moved file, every upward relative link `](../` gains one level, and a
#      bare link to a plan still in .claude/plans/ gains `../` — the file is now one
#      folder deeper. Links to sibling archived plans need nothing.
#   3. In the plans still active, a bare `](<name>.md` becomes `](archive/<name>.md`.
#   4. Across every TRACKED file outside .claude/plans/archive/, `plans/<name>.md`
#      becomes `plans/archive/<name>.md` — README, CLAUDE.md, rules, skills, hooks and
#      code comments alike. Matching on `plans/<name>.md` covers the root-relative,
#      `../`-relative and `plans/`-relative spellings all at once.
#
# It reports what it moved (or skipped) as a non-blocking message. It cannot loop:
# once the file is in archive/ it no longer matches.
#
# sed here is byte-safe for the Farsi in these files and leaves line endings alone;
# the substitutions only ever touch ASCII path text.

set -u

cat > /dev/null   # Stop-hook JSON on stdin; nothing in it is needed.

root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$root" || exit 0

plans=".claude/plans"
archive="$plans/archive"
[ -d "$plans" ] || exit 0

moved=()
skipped=()

for f in "$plans"/*.md; do
  [ -f "$f" ] || continue
  head -n 20 "$f" | grep -qE '^\*\*Status: *COMPLETE' || continue

  name=$(basename "$f")
  stem=${name%.md}
  if [ -e "$archive/$name" ]; then
    skipped+=("$name")
    continue
  fi

  mkdir -p "$archive"
  if git ls-files --error-unmatch "$f" > /dev/null 2>&1; then
    git mv "$f" "$archive/$name" || { skipped+=("$name"); continue; }
  else
    mv "$f" "$archive/$name" || { skipped+=("$name"); continue; }
  fi
  dest="$archive/$name"
  esc=${stem//./\\.}

  # 2. the moved file is one level deeper
  sed -i 's#](\.\./#](../../#g' "$dest"
  for a in "$plans"/*.md; do
    [ -f "$a" ] || continue
    s=$(basename "$a" .md); s=${s//./\\.}
    sed -i "s#](${s}\\.md#](../${s}.md#g" "$dest"
  done

  # 3. the still-active plans that link to it by bare name
  for a in "$plans"/*.md; do
    [ -f "$a" ] || continue
    # guarded: `sed -i` on a file with no match still rewrites it, and that leaves a
    # stat-dirty "M" in git status with an empty diff
    grep -qF "](${name}" "$a" || continue
    sed -i "s#](${esc}\\.md#](archive/${stem}.md#g" "$a"
  done

  # 4. every tracked reference elsewhere in the repo
  git grep -lF "plans/$name" -- ":!$archive" 2>/dev/null | while IFS= read -r ref; do
    sed -i "s#plans/${esc}\\.md#plans/archive/${stem}.md#g" "$ref"
  done

  moved+=("$name")
done

[ ${#moved[@]} -eq 0 ] && [ ${#skipped[@]} -eq 0 ] && exit 0

msg=""
if [ ${#moved[@]} -gt 0 ]; then
  msg="Archived completed plan(s) into .claude/plans/archive/: ${moved[*]}. Links to them were repointed repo-wide."
fi
if [ ${#skipped[@]} -gt 0 ]; then
  msg="$msg NOT archived (a file of that name already exists in archive/, or the move failed): ${skipped[*]} -- resolve by hand."
fi
msg=${msg//\"/\\\"}
printf '{"systemMessage":"%s"}\n' "$msg"
exit 0
