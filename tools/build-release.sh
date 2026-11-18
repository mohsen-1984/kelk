#!/usr/bin/env bash
# The two release zips, from the committed tree (git archive — nothing that is not committed goes in):
#   kelk_<v>.zip                the app: the tree without the developers' files below (what most people want)
#   kelk-with-pdf-lab_<v>.zip   the whole tree, tests/pdf-lab and CLAUDE.md (the lab's working rules) with it
# Both unpack to kelk/. <v> is scripts/config.js's version. The release workflow (.github/workflows/release.yml)
# runs this and attaches both to a published release; it can be run by hand too:
#   bash tools/build-release.sh [out-dir] [commit]      (defaults: dist/, HEAD)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
out="${1:-dist}"; rev="${2:-HEAD}"
v="$(git show "$rev:scripts/config.js" | sed -n "s/^ *version: '\([0-9.]*\)'.*/\1/p" | head -1)"
[ -n "$v" ] || { echo "no version in scripts/config.js" >&2; exit 1; }
mkdir -p "$out"; out="$(cd "$out" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
full="$out/kelk-with-pdf-lab_$v.zip" app="$out/kelk_$v.zip"
rm -f "$full" "$app"
git archive --format=zip --prefix=kelk/ -o "$full" "$rev"
# the app: the same tree without what only development needs (the owner's decisions, 2026-11-18): the working
# instructions and plans (CLAUDE.md, TODO.md), the tools and all the tests (the lab, its corpus.js and the test
# pages too), docs/ but for the three sample documents the app opens (about-and-samples, Excel, slides), CI, lint
# and npm's files, the dotfiles. README.md, LICENSE, the notices and every font's NOTICE stay.
git archive --format=tar --prefix=kelk/ "$rev" | tar -x -C "$tmp"
( cd "$tmp/kelk"
  rm -rf .github .gitattributes .gitignore eslint.config.js package.json package-lock.json CLAUDE.md TODO.md tools tests
  find docs -mindepth 1 ! -name about-kelk-and-samples.js ! -name excel-samples.js ! -name slides-samples.js -exec rm -rf {} +
  for f in index.html README.md LICENSE docs/about-kelk-and-samples.js docs/excel-samples.js docs/slides-samples.js; do
    [ -f "$f" ] || { echo "the app's tree is missing $f" >&2; exit 1; }
  done )
( cd "$tmp" && zip -qrX "$app" kelk )
echo "Kelk $v ($(git rev-parse --short "$rev")):"
for z in "$app" "$full"; do echo "  $(basename "$z")  $(unzip -Z1 "$z" | grep -vc '/$') files, $(du -h "$z" | cut -f1)"; done
