# Kelk — how we work

For anyone (person or AI assistant) picking up work on this repository — the place for working instructions;
the release checklist is [`docs/RELEASING.md`](docs/RELEASING.md). The owner is
[@mohsen-1984](https://github.com/mohsen-1984); work is done on branches and pull requests, the owner merges and
releases.

## Start here (a new session)

Read only what the task needs, in this order:

1. **This file** (`CLAUDE.md`), all of it.
2. **[`TODO.md`](TODO.md), its top section** — the release being worked on, its items in order, their lab files
   and the decisions already taken. Its decisions are final: start without asking again.
3. **[`CHANGELOG.md`](CHANGELOG.md)**: `[Unreleased]` and the newest release — what changed last.
4. For the task at hand only:
   - PDF import: the matching section of [`lib/PDFIMPORT.md`](lib/PDFIMPORT.md) (about 2,000 lines — find the
     section by searching for the rule's or the function's name; never read it whole) and
     [`tests/pdf-lab/README.md`](tests/pdf-lab/README.md) (how a lab file and its expected Markdown are made);
   - the library: [`lib/README.md`](lib/README.md); slides: [`lib/SLIDES.md`](lib/SLIDES.md);
   - a release: [`docs/RELEASING.md`](docs/RELEASING.md).

## The agreements

1. **The owner merges.** Work on a branch, open a pull request, wait for CI. When every check is green, **stop
   and tell the owner the PR is ready to merge** (its number and one line on what it does). Never merge, never
   push to `main`.
2. **Tags, releases and deleting branches are the owner's steps** (an assistant's environment usually cannot do
   them). For a release, give the owner the release notes ready to paste and the steps of
   [Publishing a release](#publishing-a-release). The zips are built by CI (`release.yml`) — no zip to hand over.
3. **Private files stay private.** Files the owner shares to show a problem never go into the repository — not
   the file, not its name, not its text, not a quote from it — nor into commit messages, PR texts or issues.
   Each problem is described in general words in `TODO.md`, and reproduced by a **lab file of our own** (made
   by a script in `tests/pdf-lab/scripts/`, with our own text). A sample is only available in the session it was
   shared in: capture what is needed from it there.
4. **Keep each round trip small.** Open only the files and the parts of files the step needs; search before
   reading; don't paste long outputs or whole files into the conversation; summarise results in a few lines.
5. **Explain git and CI simply.** The owner uses GitHub's web pages, not the command line: say what to click,
   and what a check's result means, in plain words (see [Words](#words)).
6. **No regressions.** A change to the PDF importer must pass the lab's gate (CI's *lab* check): no lab file
   scores worse than before. A fix comes with its own lab file. An expected-Markdown change that lowers a score on
   purpose is said so in the PR.
7. **Write like the repository**: the house style is plain, short sentences; English in code, comments and docs;
   the README in three languages kept in step (`fa`, `en`, `ar`).
8. **Third-party fonts without a licence — the B fonts** (B Nazanin, B Mitra, B Titr, © Borna Rayaneh; the
   owner's decision, 2026-11-06). Their files set no embedding restriction (OS/2 `fsType` 0) but no licence is
   published; the owner chose to publish them with attribution and accept that a takedown may be needed. So:
   - they live in their own folder, `borna-rayaneh/`, never mixed with the OFL fonts (Vazirmatn, Sahel) or
     their licence files;
   - `NOTICE.txt` (the publisher, the source, «all rights belong to Borna Rayaneh») travels with every copy: in
     the font zip, next to `pdf-font-b-*.js`, and wherever the TTFs are committed;
   - regular and bold are shipped byte-identical to the originals — no dehinting, subsetting or renaming; only
     the generated oblique italics are modified, and their header says so;
   - the README's fonts / third-party section says «(c) Borna Rayaneh, no published license, see
     borna-rayaneh/NOTICE.txt» — never «free», «open» or «OFL»; where a file says where the fonts come from, it
     says «downloadable from Borna Rayaneh's website» («از وب‌سایت شرکت برنا رایانه قابل دریافت‌اند»), never «free
     download» or «دریافت رایگان», so nothing reads as a free licence (2026-11-09);
   - embedding into a .docx or .pptx follows the same rule as any font: only the fonts the document uses;
   - the B-font files and every reference to them stay removable in one commit (no other change mixed into
     theirs, the references listed in that commit's message).
9. **No AI-specific documents in the README or `TODO.md`**: this file is the place for working instructions;
   the README and `TODO.md` do not mention it.

## A change, step by step

1. A branch from `main`, named for the work (`pdf/2.3-cells`, `docs/…`).
2. The change, small commits, each message saying what changed and why. Commit messages end with the
   assistant's attribution lines when an assistant made them.
3. A pull request to `main`: what it does, the lab numbers if the importer changed, anything the owner should
   check by eye.
4. CI runs by itself (a few minutes; *lab* takes longest, and runs only when the importer or the lab changed).
   Read a failed check's **summary** first (the check's page → *Summary*), its full log only if needed.
5. All green → tell the owner it is ready to merge. Red → fix on the same branch; CI runs again.

Without a shell (a chat with the GitHub connector), CI is the test runner: edit on a branch, open the PR, read the
checks' results. Generated files (`tests/pdf-lab/corpus.js`, the samples, the icons) must be regenerated by their
script — CI's *freshness* check says when one is stale; ask the owner to run the script, or do it where a shell
is available.

## Publishing a release

Follow [`docs/RELEASING.md`](docs/RELEASING.md): sections 1–5 in the release's pull request; then give the owner
the release notes ready to paste (its *Release notes format*) and point to its section 6, the owner's steps click
by click. If the *release* workflow fails, the owner says so: read its summary and fix on a branch.

## Words

- **Branch** — a copy of the code to change without touching `main` (the published version).
- **Commit** — one saved change on a branch, with a message saying what and why.
- **Pull request (PR)** — a request to bring a branch's commits into `main`; its page shows the changes, the
  checks, and the merge button.
- **CI (continuous integration)** — GitHub Actions running the checks on every PR (the files in
  `.github/workflows/`): *tooling* (lint, version, interface strings, unit tests), *builders* (every export format
  against saved snapshots), *lab* (the PDF importer against its PDFs, compared with `main`), *site* (links,
  accessibility, startup size, generated files up to date: *freshness*), *release* (the zips).
- **Green / red** — a check passed / failed. Yellow: still running.
- **Merge** — the PR's commits join `main`; the branch can then be deleted.
- **Tag** — a name (`v2.2`) fixed to one commit; a release is made on a tag.
- **Release** — a tag with notes and files (the zips) on the *Releases* page; the README's download links point
  to the newest one.
- **Artifact** — a file a CI run keeps for a while (a log, the zips), downloadable from the run's page.
