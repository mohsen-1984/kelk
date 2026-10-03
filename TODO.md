# TODO

Open work and backlog only — what is done lives in the code, `lib/README.md`, `lib/LATEX.md` and the
release notes. Version 1.5 is being prepared (released: 1.0).

## Backlog

### Formulas

- mhchem arrows (private-use glyphs) → Unicode arrows: chemistry as native MathML and Word equations
- Right-to-left `\text` as vectors (PDF) and inside Word equations (today a PNG)
- Inline `$$…$$` inside a paragraph as a centered block in Word and PDF (today inline)
- Preview "copy": the formulas' TeX in the plain-text flavor
- Equations pasted from Word (rich HTML: OMML in `<!--[if gte msEquation 12]>`) → `$…$` (`ommlToTex` already reads Word's HTML form)
- OMML ↔ TeX: `\color`, `\binom` as a delimiter, table rules (array `|`), `\label` / `\ref`
- MathJax 4 size (1.5.1): prune unused font ranges (Braille, Cherokee …) from `vendor/mathjax_4.1.3` (~12 MB; about half the zip)
- Large documents: typeset formulas lazily (visible first) in the preview

### PDF

- GPOS kerning; marks on ligatures (MarkLigPos)
- `#anchor` links inside the document
- `rowspan` in tables

### Other

- Arabic texts (interface and about document) to be read by a native speaker
