# Releasing Kelk — checklist

Go through it top to bottom for every release (x.y). A step that does not apply is ticked with a word why.
Sections 1–5 go into the release's pull request; section 6 is the owner's, click by click in
[`docs/WORKING.md`](WORKING.md#publishing-a-release).

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

- [ ] Merge the pull request.
- [ ] Release on GitHub: tag `vx.y` on `main`'s last commit (made from the release page), title `Kelk x.y`, the
      release notes. Not a pre-release (the README links `releases/latest`).
- [ ] The two files appear on the release by themselves: the *release* workflow builds `kelk_x.y.zip` (the app)
      and `kelk-with-pdf-lab_x.y.zip` (with `tests/pdf-lab`) from the tag and attaches them
      (`tools/build-release.sh`; it fails if the tag is not `scripts/config.js`'s version).
- [ ] The repository's *About* and topics, if the features changed.
- [ ] Delete the merged branches.
- [ ] Open the site (GitHub Pages) and the downloaded zip from `file://`: the version beside the name, an import, an
      export of each kind.
