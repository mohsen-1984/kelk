# real-src — the real-producer corpus's source documents

The documents behind `tests/pdf-lab/pdf/real-producers/` (plan P4.1): a Persian memo, a Persian report that mixes
English terms and two tables, an Arabic letter, an English readme, two Excel sheets (Persian and English cells, one
ruled and one without borders) and two PowerPoint decks (one right to left, one left to right).

| File | Made by | Its reference |
|---|---|---|
| `real-memo-fa.docx`, `real-report-fa.docx`, `real-letter-ar.docx`, `real-readme-en.docx` | Microsoft Word, through COM (`scripts/make-real.ps1`) | `corpus/<name>.md` |
| `real-sheet-borders-fa.xlsx`, `real-sheet-plain-fa.xlsx` | Microsoft Excel, through COM | `corpus/<name>.md` |
| `real-deck-fa.pptx`, `real-deck-en.pptx` | Microsoft PowerPoint, through COM | `corpus/<name>.md` |
| `real-*.html` | `scripts/make-real.js` (the reference through the vendored marked, a plain style) | `corpus/<name>.md` |

The text of each document was written by hand for the lab: its reference Markdown in `corpus/` is that text, and the
generators type it into Word, Excel and PowerPoint with the programs' own styles (Heading 1–2, List Bullet and List
Number, a bordered Word table, a sheet's cells, a deck's title and text layouts). The names, offices, figures and
dates in them are invented.

**Licence: CC0 1.0** — the documents, their text and the PDFs made of them are dedicated to the public domain
(https://creativecommons.org/publicdomain/zero/1.0/). The fonts drawn in the PDFs (B Nazanin, Traditional Arabic,
Tahoma, Arial, Calibri / Aptos, Segoe UI) are the Windows machine's and are embedded as subsets, as every producer
embeds them.

Remake on Windows with Office (an existing `.docx` / `.xlsx` / `.pptx` is reused unless `-Rebuild`):

```sh
powershell -NoProfile -ExecutionPolicy Bypass -File tests/pdf-lab/scripts/make-real.ps1 [-Only regex] [-Rebuild]
node tests/pdf-lab/scripts/make-real.js [doc-regex]
```
