# Held-out protocol

**In force since:** 1405-08-12 · **Next fuzz rotation due:** 1406-02-12

A held-out set measures whether a change to the PDF importer **generalises**: whether it helps on files nobody
looked at while writing it. Once someone looks at one of its files and writes a rule from what they saw, the set
has become a second dev set and measures nothing. This page says which sets are held out, who may open what, how
an opening is recorded, how the sets are rotated, and what every report checks.

## The guards

| # | Set | Where | How it is read | Gate |
|---|---|---|---|---|
| 1 | **Fuzz held-out**: 100 style-fuzzed PDFs, seeds `HELDOUT_BASE`… | `tests/pdf-lab/scripts/make-fuzz.js heldout` → `fuzz/heldout/` | `run-fuzz.js heldout`: the mean, per direction, per style value — no file names; no Markdown and no per-file row written (`fuzz-heldout/_scores.json` holds the summary alone) | `gate.js` fuzz part: mean, ltr / rtl means and the `rtl` column, TOL 1 |
| 2 | **Real-producer held-out**: every lab PDF of a held-out document (P4.1's documents, `HELD_DOCS`), in whatever folder | `tests/pdf-lab/scripts/heldout.js` (the split) | `run-import.js --real-heldout`: one mean (total and `rtl` column), the count and the file names | `gate.js` `realHeldout` part: mean total and `rtl` column, TOL 1; a missing result fails |
| 3 | **Private real files**: a user's PDFs, never committed | `tests/pdf-lab/real/` (gitignored) or any folder outside the repository | `snapshot.js` before and after a change, `--against` the earlier snapshot | none (reference-free, read by the owner) |

The dev sets — the corpus (`pdf/` without the held-out real documents), the fuzz `dev` split, the metamorphic
net — are open to everyone: open the files, read the Markdown, write rules from them.

## The real-producer split

The split is **by document**, never by file. A lab PDF's document is the part of its name after the producer's
`--` (`edge--real-memo-fa.pdf` → `real-memo-fa`; a name without `--` is no document). Every PDF of a held-out
document is held out **wherever it lies** — `pdf/real-producers/` or any other folder, from any producer — so a rule
written for a document seen through Word is never measured on the same document through Edge, nor through a
producer added later in another folder.

**Which documents.** The held-out documents are a committed list, `HELD_DOCS` in `heldout.js`: once a document is
held out it **stays held out** — adding documents never moves one (no fill, no ranking among documents). A document
not in the list is assigned by its own name alone: held out when the fixed hash of its name
(`sha-256("kelk-real-heldout-1\n" + name)`, read as a number in [0, 1)) is below 0.30 (`REAL_SALT`, `REAL_SHARE`),
dev otherwise — nobody picks it. The hash rule looks at the documents of `pdf/real-producers/` (the corpus documents
are dev). A new document the hash holds out is added to `HELD_DOCS` in the change that brings it
(`tests/unit/heldout.test.js` fails until it is). The list holds at least 4 documents that were never opened
(`REAL_MIN`, checked by the test). `node tests/pdf-lab/scripts/heldout.js` prints the split; the test pins it
against the real lab (`labPdfs()`), so a document changing sides is a visible, reviewed decision.

The split of 1405-08-12 (13 documents, 44 real-producer PDFs; no other lab PDF is of a held-out document):

| Side | Documents | PDFs |
|---|---|---|
| held out (4, `HELD_DOCS`) | `real-deck-fa`, `real-letter-ar`, `real-memo-fa`, `real-report-fa` (three by their hash below 0.30; `real-letter-ar` by the first split's fill to 4, now fixed in the list) | 17 |
| dev (9) | `real-deck-en`, `real-readme-en`, `real-sheet-borders-fa`, `real-sheet-plain-fa`, `word-rich`, `word-tables`, `xl-border-black`, `xl-border-none`, `xl-border-white` | 27 |

The held-out PDFs are left out of the normal `run-import.js` run and so of the corpus gate, file by file (`gate.js`
drops any row of a held-out document from both sides — an older run's or baseline's — so no note or failure names
one); `gate.js --update` drops their rows from `baseline.json` and stores the mean (`realHeldout`) instead.
`run-import.js --real-heldout` prints one line, the final count and the means, and writes only
`LAB_OUT/real-heldout/_scores.json` — the count, the crashes, the documents, the sorted file names (public, as the
documents are) and the means of the total and the `rtl` column — no Markdown, no per-file score. The gate compares
it only with a side that read the same documents and the same file names; it **fails** when the lab has held-out
PDFs and the run has no such result, and `--update` refuses a result older than the corpus run's `_scores.json`.
CI runs it for the base and the head importer (`.github/workflows/pdf-lab.yml`) and never uploads it.

Five of the P4.2 goldens (`tests/pdf-lab/golden/`) are typed from held-out real PDFs (`real-letter-ar` ×3,
`real-report-fa`, `real-memo-fa`). They stay — a golden is typed by a person, and moving them would mean typing
others — but are read as the held-out is: `golden.js` scores them and writes only their mean (`heldout` in
`golden/_scores.json`; no row, no Markdown), and `gate.js` compares that mean (TOL 1, `baseline.json`
`goldenHeldout`); a filtered `golden.js` run leaves them out.

The split counts from 1405-08-12. Per-file scores of these documents printed before that (P4.1's own runs, and
P4.2's golden runs for the five goldens above) were read before any rule was written from them (P4.1 and P4.2
changed no importer code); a rule written later from such a number moves its document to dev (below).

## Who may open what

| Set | Anyone (contributors, sessions, agents) | Only the owner, and logged |
|---|---|---|
| fuzz held-out | the output of `run-fuzz.js heldout` (means, per direction, per style value); the gate's lines | `run-fuzz.js heldout --show` (file names and per-file totals), opening a `fuzz/heldout/` PDF or its Markdown — only to decide a rotation, never to write a rule |
| real held-out | the mean of `run-import.js --real-heldout`; the gate's line; the split (document names) | opening a held-out PDF, its Markdown, or any per-file score — only to retire the document (it moves to dev) |
| private real files | the counts a report gives (files same / changed / crashing) | the files, their names, the snapshots and their diffs — on the owner's machine, outside the repository |

"Opening" is any reading of a held-out file as a file: its PDF, the importer's Markdown of it, its name next to
a score, its per-file score. A held-out run filtered to a few files is an opening too (`gate.js --update` after a
filtered run is never done).

**The guard.** The lab's file-by-file tools call `openHeld()` (`tests/pdf-lab/scripts/env.js`) with the files they
are about to open. Every held-out file among them — under `fuzz/heldout/` (or `LAB_FUZZ`'s), in `LAB_OUT/fuzz-heldout/`,
or a PDF / Markdown of a held-out document — is logged to the opened log (`fuzz:heldout`, or `real:<document>`, with
the tool's name), with a warning; the tool still runs. Guarded: `dbg.js`, `dump.js`, `cmp.js`, `lines.js`,
`shapes.js`, `words.js`, `snapshot.js`, and `run-crash.js --show-held`. `run-crash.js` without `--show-held` imports
the held-out files but keeps them nameless (counts only, no row in `crash-*.json`) — CI's crash sweep over `pdf/`
opens nothing. **Logged by hand** (they read whole folders, or open files the guard cannot see): `struct.js`,
`features.js`, `run-stress.js` and `run-real.js` given a held-out PDF, opening a held-out PDF in a viewer, reading a held-out
Markdown or HTML left in an old `LAB_OUT` — `node tests/pdf-lab/scripts/heldout.js opened real:<document>` or
`… opened fuzz:heldout`.

**Old `LAB_OUT` folders.** Runs from before P4.3 (and `run-fuzz.js heldout` runs before this protocol's fix) wrote
the Markdown, HTML and per-file rows of held-out files into `LAB_OUT` (`<name>.md` of the held-out documents' PDFs,
`fuzz-heldout/*.md`, `fuzz-heldout/_scores.json` rows). Delete those folders (or at least their held-out files)
before working in them again; reading one is an opening.

## When a held-out file was opened

- **Fuzz held-out.** `run-fuzz.js heldout --show` appends a line to `tests/pdf-lab/heldout-opened.log` — Shamsi
  date, `fuzz:heldout`, the git user, the generator, the seed base — and prints a warning before anything else; the
  guarded tools do the same (above). Any other opening is logged by hand:
  `node tests/pdf-lab/scripts/heldout.js opened fuzz:heldout`. The set is then rotated (below) before the next report
  reads its mean.
- **Real held-out.** The guarded tools log it themselves; otherwise log it by hand
  (`node tests/pdf-lab/scripts/heldout.js opened real:<document>`). Then move the document from `HELD_DOCS` to
  `REAL_OPENED` in `heldout.js` with the date, and update the pinned split in `tests/unit/heldout.test.js`: the
  document is dev from then on. **The held-out side is refilled only by NEW documents, never by an existing dev
  one** — every dev document was read file by file. If fewer than 4 held-out documents are left, add new real
  documents (`make-real.ps1` / `make-real.js` on the Windows machine, `corpus/real-*.md`) until the hash rule has
  held out enough of them, and add those to `HELD_DOCS`.
- **Private real files** are not held-out files: the owner reads them by design. A problem they show is rebuilt as
  a lab PDF of our own (`make-*.js`), which is dev.

**The log is in the repository**: `tests/pdf-lab/heldout-opened.log` (`heldout.js` `OPENED_LOG`), appended by `--show`,
the guard and `heldout.js opened`, and **committed with the change that opened something** — so it is the same on
both contributors' machines and on CI, whatever `LAB_OUT` a run used. `gate.js` reads it from there and names it
in its notes whenever it has lines; the report says what it held.

## Rotation

The fuzz held-out seeds rotate **every 6 months** (the next due date is at the top of this page) **or as soon as a
held-out file was opened**, whichever comes first. A rotation:

1. `node tests/pdf-lab/scripts/make-fuzz.js --rotate` prints the current block and the next one (it changes
   nothing). The held-out base moves up by 100000 — 100001 → 200001 → 300001 … — never back to an earlier block.
2. In `tests/pdf-lab/scripts/make-fuzz.js`: `HELDOUT_ROTATION` + 1, and a row in the rotation history above it
   (Shamsi date · base · why: "6 months" or "opened <date> by <name>").
3. `node tests/pdf-lab/scripts/make-fuzz.js heldout`, then `run-fuzz.js heldout`. From rotation 1 on the manifest's
   env carries `heldoutRotation`, so the gate does not compare the new block's mean with the old block's baseline
   (a note); CI (head against base on the same, freshly drawn PDFs) keeps gating as before.
4. In the approval step: the held-out part of `baseline.json` rebuilt (a manual CI run with `baseline` ticked).
5. The old `tests/pdf-lab/heldout-opened.log` renamed to `tests/pdf-lab/heldout-opened.<date>.log` (committed); the next due date at the top of this page
   moved 6 months on; the report says the rotation happened and why.

The real-producer split is not rotated by changing its salt (that would move dev documents, which were read, into
held-out). It is renewed by adding documents: a new document's side follows from its hash, an opened one moves to
dev.

## Private real files: the third guard

Real PDFs a user sends never enter the repository, nor their names. `snapshot.js` keeps them as a reference-free
regression set: no source Markdown, only signals measured against pdftotext and the file itself (words found and
their order, glued Arabic-script words, pictures, U+FFFD, headings, items, tables, code, quotes).

```sh
node tests/pdf-lab/scripts/snapshot.js tests/pdf-lab/real <outside>/snap-before            # before a rule change
node tests/pdf-lab/scripts/snapshot.js tests/pdf-lab/real <outside>/snap-after --against <outside>/snap-before
```

Each file reads `same`, or `CHANGED` with its lines added and removed and the signals that moved. The snapshot
folders stay outside the repository. A report states the counts only (files, same, changed, crashing).

## The report checklist line

Every report of a change to the importer (the pull request's description) carries this line, filled in:

> **Held-out:** fuzz held-out mean _ (rotation _, seed base _) · real held-out mean _ (_ PDFs of _ documents) ·
> `heldout-opened.log`: _ lines (none / rotated on _) · private real files: _ same, _ changed, _ crashing (or "not
> run") · next rotation due _.
