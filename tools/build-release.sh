#!/usr/bin/env bash
# The two release zips, from the committed tree (git archive — nothing that is not committed goes in):
#   kelk_<v>.zip                the app: the tree without the developers' files below (what most people want)
#   kelk-with-pdf-lab_<v>.zip   the whole tree, tests/pdf-lab with it
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
# the app: the same tree without what only development needs (the lab but its corpus.js, which the app's own
# PDF suite reads; the golden snapshots, schemas and unit tests; CI, lint and npm's files; the dotfiles)
git archive --format=tar --prefix=kelk/ "$rev" | tar -x -C "$tmp"
( cd "$tmp/kelk"
  rm -rf .github .gitattributes .gitignore eslint.config.js package.json package-lock.json \
         tests/docx-validate.js tests/golden tests/ooxml-xsd tests/unit
  find tests/pdf-lab -mindepth 1 -maxdepth 1 ! -name corpus.js -exec rm -rf {} +
  [ -f index.html ] && [ -f tests/pdf-lab/corpus.js ] || { echo "the app's tree is missing a file" >&2; exit 1; } )
( cd "$tmp" && zip -qrX "$app" kelk )
echo "Kelk $v ($(git rev-parse --short "$rev")):"
for z in "$app" "$full"; do echo "  $(basename "$z")  $(unzip -Z1 "$z" | grep -vc '/$') files, $(du -h "$z" | cut -f1)"; done
