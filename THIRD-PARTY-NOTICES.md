# Third-party notices

Kelk's own code is under the MIT License (see `LICENSE`). It ships the libraries and fonts below,
unchanged unless noted; each keeps its own license.

## Libraries (`vendor/`)

| Library | Version | License | File | Source |
|---|---|---|---|---|
| marked | 18.0.14 | MIT | `vendor/marked.umd.min_18.0.14.js` | https://github.com/markedjs/marked |
| DOMPurify | 3.4.16 | Apache-2.0 or MPL-2.0 | `vendor/purify.min_3.4.16.js` | https://github.com/cure53/DOMPurify |
| highlight.js | 11.12.0 (theme 11.11.1) | BSD-3-Clause | `vendor/highlight.js/` | https://github.com/highlightjs/highlight.js |
| Lucide | 1.48.0 | ISC | `vendor/lucide.min_1.48.0.js` (also the `:name:` icons of slides); subset in `assets/icons.js` | https://lucide.dev |
| Turndown | 7.2.4 | MIT | `vendor/turndown/turndown_7.2.4.js` | https://github.com/mixmark-io/turndown |
| turndown-plugin-gfm | 1.0.2 | MIT | `vendor/turndown/turndown-plugin-gfm_1.0.2.js` | https://github.com/mixmark-io/turndown-plugin-gfm |
| mammoth | 1.12.3 | BSD-2-Clause | `vendor/mammoth.browser.min_1.12.3.js` | https://github.com/mwilliamson/mammoth.js |
| docx | 9.7.1 | MIT | `vendor/docx.index.iife.min_9.7.1.js` | https://github.com/dolanmiu/docx |
| jsPDF | 4.2.1 | MIT | `vendor/jspdf.umd.min_4.2.1.js` | https://github.com/parallax/jsPDF |
| PptxGenJS (the minified build without its source-map line) | 4.0.1 | MIT | `vendor/pptxgen.min_4.0.1.js` | https://github.com/gitbrent/PptxGenJS |
| JSZip (with pako) | 3.10.2 | MIT (dual MIT / GPLv3; used under MIT) | `vendor/jszip.min_3.10.2.js` | https://github.com/Stuk/jszip |
| SheetJS Community Edition (`xlsx.full.min.js`, with its codepage tables) | 0.20.3 | Apache-2.0 | `vendor/xlsx.full.min_0.20.3.js` | https://git.sheetjs.com/sheetjs/sheetjs |
| PDF.js (pdfjs-dist; wrapped as classic scripts by `tools/build-pdfjs.js`, code unchanged) | 6.4.299 | Apache-2.0 | `vendor/pdfjs/` (`LICENSE` there) | https://github.com/mozilla/pdf.js |
| OpenJPEG and PDFium JBIG2 decoders (WebAssembly builds shipped with PDF.js; base64) | PDF.js 6.4.299 | BSD-2-Clause (OpenJPEG), BSD-3-Clause (PDFium); PDF.js glue Apache-2.0 | `vendor/pdfjs/wasm/` (`LICENSE_*` there) | https://github.com/mozilla/pdf.js |
| MathJax (startup, core, TeX input + extensions, SVG output, ui/safe) | 4.1.3 | Apache-2.0 | `vendor/mathjax_4.1.3/` (`LICENSE` there) | https://github.com/mathjax/MathJax |
| MathJax New Computer Modern font (SVG data) | 4.1.3 | Apache-2.0 | `vendor/mathjax_4.1.3/fonts/mathjax-newcm-font/` | https://cdn.jsdelivr.net/npm/@mathjax/mathjax-newcm-font@4.1.3/ |
| MathJax mhchem font extension (SVG data) | 4.1.3 | Apache-2.0 | `vendor/mathjax_4.1.3/fonts/mathjax-mhchem-font-extension/` | https://cdn.jsdelivr.net/npm/@mathjax/mathjax-mhchem-font-extension@4.1.3/ |

The license text of each library is in its file header or at its source.

## Fonts

| Font | Version | License | Where | License file |
|---|---|---|---|---|
| Vazirmatn | 33.003 | SIL Open Font License 1.1 | web font; PDF font; .ttf to install for Word | `assets/fonts/rastikerdar/webfonts/VAZIRMATN-LICENSE-OFL.txt`, `lib/pdf-base64-ttf-fonts/VAZIRMATN-LICENSE-OFL.txt`, `vazirmatn/OFL.txt` in `assets/fonts/download/persian-fonts-ttf.zip` |
| Sahel | 3.4.0 | SIL Open Font License 1.1 | web font; PDF font; .ttf to install for Word | `…/SAHEL-LICENSE-OFL.txt` (both folders), `sahel/OFL.txt` in the zip |
| Vazir Code (Hack variant) | 1.1.2 | changes in the public domain; Hack glyphs MIT; Bitstream Vera license | web font; PDF font | `assets/fonts/vazir-code/VAZIR-CODE-LICENSE.txt`, `lib/pdf-base64-ttf-fonts/VAZIR-CODE-LICENSE.txt` |
| DejaVu Sans, DejaVu Sans Mono | 2.37 | Bitstream Vera and Arev licenses (DejaVu changes in the public domain) | web fonts; PDF fonts | `assets/fonts/dejavu/DEJAVU-LICENSE.txt`, `lib/pdf-base64-ttf-fonts/DEJAVU-LICENSE.txt` |
| Noto Emoji | — | SIL Open Font License 1.1 | PDF font (monochrome) | `lib/pdf-base64-ttf-fonts/NOTO-EMOJI-LICENSE-OFL.txt` |
| B Nazanin, B Mitra, B Titr | 2.01 | (c) Borna Rayaneh, no published license, see borna-rayaneh/NOTICE.txt | preview font (B Nazanin, B Mitra: the TTFs as they are); PDF font; .ttf to install for Word | `lib/pdf-base64-ttf-fonts/borna-rayaneh/NOTICE.txt`, `borna-rayaneh/NOTICE.txt` in the zip |

Vazirmatn, Sahel and Vazir Code are the work of the late Saber Rastikerdar
(https://github.com/rastikerdar).

**B Nazanin, B Mitra, B Titr** belong to Borna Rayaneh (https://www.bornaray.com/) and are downloadable from
Borna Rayaneh's website. They are kept apart, in `borna-rayaneh/` folders with their `NOTICE.txt`; regular and bold
are byte-identical to the publisher's files, and only the generated oblique styles of their PDF font files are
modified (each file's header says so).

**Modified versions.** The PDF fonts (`lib/pdf-base64-ttf-fonts/pdf-font-*.js`) are modified as
their licenses allow: hinting removed, some cut down to Unicode subsets, oblique styles generated,
and — for Vazir Code — lam-alef composites added; each file's header says exactly what was done.
The Bitstream-Vera-based fonts (DejaVu, Vazir Code) keep names without "Bitstream" or "Vera", as
that license requires. `tools/build_pdf_fonts.py` rebuilds them.

The base64 web fonts in `assets/fonts/embed/` are the same web fonts, unchanged, encoded for the
standalone HTML export.
