# Releasing Kelk — checklist

Go through it top to bottom for every release (x.y). A step that does not apply is ticked with a word why.
Sections 1–5 go into the release's pull request; section 6 is the owner's, click by click.

## 1. Version

- [ ] `scripts/config.js` → `version: 'x.y'` (the one source: the app, the version beside the name, the files' creator).
- [ ] `node tools/check-version.js` — it lists every other place that must say the same and fails until they do:
      `package.json` (`x.y.0`), `lib/*.js` headers, `BuilderBase.version`, `MathCore`, `BidiView`, `lib/README.md`,
      `tools/bidi-lab.html`, the README download links (`kelk_x.y.zip`), the newest CHANGELOG heading.
      (`PdfImporter` and `PptxBuilder` keep their own versions.)
- [ ] `node tests/golden/run.js --update`: the builders' snapshots carry the version (generator, creator); check
      `git diff tests/golden` shows nothing but `x.y` and the shared sections' new names (2.3: CI's *builders*
      failed on the old version until then).

## 2. What the exported files say about themselves

- [ ] Export one short document to each format and read its properties: PDF *Creator*, DOCX *creator* and
      *lastModifiedBy*, PPTX *creator* and *lastModifiedBy* (and *Company*), HTML `<meta name="generator">` —
      all `Kelk x.y`; title and author from Settings → Document.

## 3. Words

- [ ] `CHANGELOG.md`: `## [x.y] — YYYY-MM-DD` with the day the release is published; concise release notes
      (Added / Changed / Fixed), not a work log.
- [ ] `README.md`, all three languages in step: features, figures (lab size, scores), download names, screenshots'
      alt text.
- [ ] `docs/about-kelk-and-samples.{en,fa,ar}.md` and `docs/slides-sample.{en,fa,ar}.md` when a feature changed, then
      `node tools/build-samples.js`.
- [ ] `lib/README.md`, `lib/SLIDES.md`, `lib/PDFIMPORT.md`, `lib/LATEX.md`: the API and the numbers they quote.
- [ ] `TODO.md`: done items out, new findings in, priorities (High / Medium / Optional) still true.
- [ ] Settings → Slides prompt (`scripts/slides.js` `prompt`) and `lib/SLIDES.md` say the same convention.

## 4. Pictures

- [ ] `docs/screenshots/*.png` — again when the interface changed visibly (1280 × 800, the about-and-samples
      document, light theme; fa / en / ar).
- [ ] `tools/og-image.html` → `assets/og-image.png` (1200 × 630) when the features it names changed.

## 5. Generated files and checks

- [ ] `node tools/build-icons.js`, `node tools/build-samples.js`, `node tests/pdf-lab/scripts/build-corpus-js.js`
      (CI's *freshness* job fails on a stale one).
- [ ] `tools/size-budget.json`: the startup size, and why it changed.
- [ ] A pull request to `main` with every CI check green: tooling (lint, version, strings, unit tests), builders
      (goldens, OOXML), lab (the gate: corpus, fuzz, metamorphic, golden, held-out), size, links, accessibility,
      freshness. `node tests/run-slides-suite.js` for the slides.
- [ ] A PDF import change: the lab's gate passed with no file worse — the numbers go into the CHANGELOG.

## 6. Publishing (the owner)

**Publish only after the release PR is merged** (the owner's rule, 2026-11-09). The release PR is the one that
changes the version in `scripts/config.js`; until it is merged, `main` still has the old version and the *release*
workflow fails on the tag. So the assistant asks for publishing in one message of its own, after that merge, in so
many words: «the release PR is merged, now publish» — and never mentions publishing alongside any other PR (not
when one is ready to merge, not in the release PR's own «ready to merge» message). Release notes may be given
earlier, marked as for later.

On GitHub's web pages, click by click:

1. **Merge** the release PR: the PR's page → **Merge pull request** → **Confirm merge**.
2. **Publish** — only now, with the release PR merged: the repository's page → **Releases** (right side) → **Draft a new release** →
   **Choose a tag** → type `vx.y` (the new version) → **Create new tag: vx.y on publish**; *Target*: `main` →
   *Release title*: `Kelk x.y` → paste the notes → leave *Set as a pre-release* unticked (the README links
   `releases/latest`) → **Publish release**.
3. **Wait a minute or two**: the *release* workflow builds `kelk_x.y.zip` (the app) and
   `kelk-with-pdf-lab_x.y.zip` (with `tests/pdf-lab`) from the tag and attaches them to the release
   (`tools/build-release.sh`; it fails if the tag is not `scripts/config.js`'s version). Refresh the release's
   page: they appear under *Assets*. If they don't: **Actions** → *release* → the failed run → read its summary.
4. **Delete the merged branch**: on the merged PR's page → **Delete branch** (or **Code** → **Branches** → the
   bin icon beside it).
5. **Check**: open the site (GitHub Pages), and the downloaded `kelk_x.y.zip` from your disk (`index.html`): the
   version beside the name, one import, one export of each kind.
6. The repository's *About* and topics, if the features changed.

To look at the zips **before** publishing: **Actions** → *release* → **Run workflow** (branch `main`) → when it
finishes, its page → *Artifacts* → `release-zips`.

**Release notes format** (as 2.1–2.3): one sentence on what the release is about; five or so bullets, each a
change a user notices («Fixed: …» for fixes); one bullet for the PDF lab with its numbers when the importer
changed; then:

```text
Downloads:

- kelk_x.y.zip — the app: unzip and open index.html
- kelk-with-pdf-lab_x.y.zip — the same plus the PDF import lab (N test PDFs), for development

Full notes: CHANGELOG.md
```
