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

The sources and the PDFs hold no user name and no local folder: Office writes the Windows user as the author
(`docProps/core.xml`, a Save as PDF file's `/Author` and XMP `dc:creator`) and a workbook's folder (`x15ac:absPath`);
`scripts/strip-meta.js` clears them (make-real.ps1 runs it at its end) and keeps Producer and Creator, which name the
application. The page content is not touched (the script compares every page's content stream before and after).

## What remaking needs

Importing and scoring these PDFs needs only Node and Playwright. Remaking them needs:

| What | Why |
|---|---|
| Windows with **Microsoft Office LTSC 2024** (Word, Excel, PowerPoint) | the files are what Office 2024 draws: its default fonts are Aptos (Word, PowerPoint) and Aptos Narrow (Excel); Office 2021 and older use Calibri, which moves every line and cell. Office 365 is close but not the same build |
| the **Microsoft Print to PDF** printer | the `msprint-*` files (it ships with Windows 10 and 11; *Windows features* → *Microsoft Print to PDF* if it was removed) |
| **Microsoft Edge** and **Mozilla Firefox** at their default paths (or `EDGE=…`, `FIREFOX=…`) | `edge--*`, `firefox--*` (make-real.js); `chrome--*` is Playwright's own Chromium (`npm ci`; no Chrome needed) |
| the font **Traditional Arabic** | the Arabic letter; it ships with Windows |
| the font **B Nazanin** | the Persian memo and the bordered sheet. It is **not** a Windows font: it is one of the free "B" Persian fonts (Borna Rayaneh) that most Persian Office installations add. Install `BNazanin.ttf` (and the Bold) **for the current user** — right-click → *Install*, which puts it in `%LOCALAPPDATA%\Microsoft\Windows\Fonts` (no administrator); Word, Excel and the browsers find it there. Without it every program falls back to another font and the PDFs differ |
| Node (the dev tools from `npm ci`) | `make-real.js` and `strip-meta.js` |

The Windows locale and number format do not matter: `make-real.ps1` sets Excel's decimal and thousands separators to
`.` and `,` for every sheet (and puts the user's own back afterwards), and sets Word's numeral option to *Context* for
the run.

Remake on Windows with Office (an existing `.docx` / `.xlsx` / `.pptx` is reused unless `-Rebuild`):

```sh
powershell -NoProfile -ExecutionPolicy Bypass -File tests/pdf-lab/scripts/make-real.ps1 [-Only regex] [-Rebuild]
node tests/pdf-lab/scripts/make-real.js [doc-regex]
```
