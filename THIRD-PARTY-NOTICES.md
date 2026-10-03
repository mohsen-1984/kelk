# Third-party notices

Kelk's own code is under the MIT License (see `LICENSE`). It ships the libraries and fonts below,
unchanged unless noted; each keeps its own license.

## Libraries (`vendor/`)

| Library | Version | License | File | Source |
|---|---|---|---|---|
| marked | 18.0.14 | MIT | `vendor/marked.umd.min_18.0.14.js` | https://github.com/markedjs/marked |
| DOMPurify | 3.4.16 | Apache-2.0 or MPL-2.0 | `vendor/purify.min_3.4.16.js` | https://github.com/cure53/DOMPurify |
| highlight.js | 11.12.0 (theme 11.11.1) | BSD-3-Clause | `vendor/highlight.js/` | https://github.com/highlightjs/highlight.js |
| Lucide | 1.48.0 | ISC | `vendor/lucide.min_1.48.0.js`; subset in `assets/icons.js` | https://lucide.dev |
| Turndown | 7.2.4 | MIT | `vendor/turndown/turndown_7.2.4.js` | https://github.com/mixmark-io/turndown |
| turndown-plugin-gfm | 1.0.2 | MIT | `vendor/turndown/turndown-plugin-gfm_1.0.2.js` | https://github.com/mixmark-io/turndown-plugin-gfm |
| mammoth | 1.12.3 | BSD-2-Clause | `vendor/mammoth.browser.min_1.12.3.js` | https://github.com/mwilliamson/mammoth.js |
| docx | 9.7.1 | MIT | `vendor/docx.index.iife.min_9.7.1.js` | https://github.com/dolanmiu/docx |
| jsPDF | 4.2.1 | MIT | `vendor/jspdf.umd.min_4.2.1.js` | https://github.com/parallax/jsPDF |
| MathJax (startup, core, TeX input + extensions, SVG output, ui/safe) | 4.1.3 | Apache-2.0 | `vendor/mathjax_4.1.3/` (`LICENSE` there) | https://github.com/mathjax/MathJax |
| MathJax New Computer Modern font (SVG data) | 4.1.3 | Apache-2.0 | `vendor/mathjax_4.1.3/fonts/mathjax-newcm-font/` | https://github.com/mathjax/MathJax-fonts |
| MathJax mhchem font extension (SVG data) | 4.1.3 | Apache-2.0 | `vendor/mathjax_4.1.3/fonts/mathjax-mhchem-font-extension/` | https://github.com/mathjax/MathJax-fonts |

The license text of each library is in its file header or at its source.

## Fonts

| Font | Version | License | Where | License file |
|---|---|---|---|---|
| Vazirmatn | 33.003 | SIL Open Font License 1.1 | web font; PDF font | `assets/fonts/rastikerdar/webfonts/VAZIRMATN-LICENSE-OFL.txt`, `lib/pdf-base64-ttf-fonts/VAZIRMATN-LICENSE-OFL.txt` |
| Sahel | 3.4.0 | SIL Open Font License 1.1 | web font; PDF font | `…/SAHEL-LICENSE-OFL.txt` (both folders) |
| Vazir Code (Hack variant) | 1.1.2 | changes in the public domain; Hack glyphs MIT; Bitstream Vera license | web font; PDF font | `assets/fonts/vazir-code/VAZIR-CODE-LICENSE.txt`, `lib/pdf-base64-ttf-fonts/VAZIR-CODE-LICENSE.txt` |
| DejaVu Sans, DejaVu Sans Mono | 2.37 | Bitstream Vera and Arev licenses (DejaVu changes in the public domain) | web fonts; PDF fonts | `assets/fonts/dejavu/DEJAVU-LICENSE.txt`, `lib/pdf-base64-ttf-fonts/DEJAVU-LICENSE.txt` |
| Noto Emoji | — | SIL Open Font License 1.1 | PDF font (monochrome) | `lib/pdf-base64-ttf-fonts/NOTO-EMOJI-LICENSE-OFL.txt` |

Vazirmatn, Sahel and Vazir Code are the work of the late Saber Rastikerdar
(https://github.com/rastikerdar).

**Modified versions.** The PDF fonts (`lib/pdf-base64-ttf-fonts/pdf-font-*.js`) are modified as
their licenses allow: hinting removed, some cut down to Unicode subsets, oblique styles generated,
and — for Vazir Code — lam-alef composites added; each file's header says exactly what was done.
The Bitstream-Vera-based fonts (DejaVu, Vazir Code) keep names without "Bitstream" or "Vera", as
that license requires. `tools/build_pdf_fonts.py` rebuilds them.

The base64 web fonts in `assets/fonts/embed/` are the same web fonts, unchanged, encoded for the
standalone HTML export.
