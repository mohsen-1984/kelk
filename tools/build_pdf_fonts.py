#!/usr/bin/env python3
"""
build_pdf_fonts.py — build pdf-font-<key>.js files for PdfBuilder (jsPDF VFS)

Needs: Python 3 + fontTools (pip install fonttools)
Run:   python3 tools/build_pdf_fonts.py [key …]   (from anywhere; works in lib/pdf-base64-ttf-fonts,
       where the font sources, the license files and the pdf-font-*.js outputs live)

For each family (see FAMILIES below):
  1. dehint   — remove TrueType hinting (fpgm/prep/cvt, glyph instructions),
                gasp → smooth, no forced integer ppem. Hinted fonts can look
                jagged in PDF viewers that apply hinting (this was Sahel).
  2. oblique  — generate italic / bold italic by slanting 10° when the family
                has no italic (Vazirmatn, Sahel); italic=False omits them.
  3. subset   — optional: keep only the given Unicode ranges, drop hinting and
                OpenType layout tables (jsPDF uses neither) — for fallback fonts.
  4. emoji    — optional (emoji=True): jsPDF reads only the BMP cmap (format 4)
                and ignores GSUB, so every emoji above U+FFFF and every GSUB
                ligature (ZWJ sequences, flags, skin tones, keycaps, tag flags)
                gets a Private Use Area code point from U+E000 on; the sequence
                list (index i ↔ U+E000 + i) is emitted with the font.
  5. emit     — pdf-font-<key>.js adding PdfFonts.<key> = { family, version,
                styles: { normal, bold[, italic, bolditalic]: { vfsName, data } } }
                with the license notice in the header comment.

Family fields: key, family, version, source, license_file, copyright,
regular, bold, italic / bolditalic (path | None → oblique | False → none),
dehint, tribute, notes (font notes text), and optional file (output name
without pdf-font-/.js), usage (setFonts call shown), subset (list of
(first, last) code point ranges), license_text (replaces the OFL paragraph),
emoji (True → PUA remap above). regular / bold = None → style omitted.

Four styles, one file per family
────────────────────────────────
PdfBuilder draws HTML converted from Markdown: the only style changes are
<strong> and <em>, i.e. normal, bold, italic and bold italic. So every family
is emitted as ONE pdf-font-<name>.js holding exactly these four styles (as
Vazirmatn and Sahel). Other weights of a font (Light, Medium, SemiBold, …)
would never be selected and are not built — not for text, symbol or emoji
fonts. A family without a true italic gets a generated 10° oblique.

Only STATIC TTF input (no variable fonts, no WOFF/WOFF2).

jsPDF (4.2.1) constraints — what this script works around, and what it cannot
─────────────────────────────────────────────────────────────────────────────
Worked around here:
  • cmap: jsPDF reads only a BMP (format 4) subtable. Code points above U+FFFF
    never reach its codeMap and draw as .notdef → emoji fonts are remapped to
    the BMP Private Use Area (step 4).
  • GSUB: never applied, so ligature-built glyphs (emoji sequences) are
    unreachable → same PUA remap. (Arabic shaping is done by PdfBuilder.)
  • Italic: jsPDF cannot slant a font → generated oblique (step 2).
  • Hinting: some viewers honour TrueType hinting and snap outlines → dehint.
  • Size: every registered style that is drawn is embedded as a glyph subset;
    fallback fonts are subset further here (step 3) to keep the .js small.
Not fixable here (documented in PdfBuilder):
  • Colour fonts (COLR/CPAL, CBDT, sbix, SVG) are not supported → monochrome
    emoji only. Variable fonts (gvar) are not supported → static instances.
  • GPOS is ignored by jsPDF. Mark attachment is worked around: the
    MarkBasePos / MarkMarkPos anchors (harakat, Hebrew points) are read here
    from the SOURCE font (subsetting drops GPOS) and emitted as `marks`;
    PdfBuilder places those marks itself. Kerning and ligature attachment
    (MarkLigPos) are not applied.
  • ToUnicode is built from the code points actually drawn and cut to 4 hex
    digits, so emoji copied or searched in the PDF give their PUA code points.
Contracts with PdfBuilder (>= 1.2.0) for emoji fonts:
  • `emoji.seq` entry i ↔ U+E000 + i. The order comes from the font's cmap and
    GSUB, so a new font version may reassign PUA code points: always rebuild
    all four styles together (they share one list; checked here, and again at
    registration if a family is registered twice).
  • PUA capacity: U+E000–U+F8FF = 6400 entries per emoji font (checked).
  • A pdf-font-*.js file and its license file must travel together.

Usage: python3 build_pdf_fonts.py  (edit FAMILIES paths first)
"""
import base64, math, os, shutil
from fontTools import subset as ftsubset
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables import ttProgram
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.recordingPen import DecomposingRecordingPen

OUT = 'build'

# Unicode ranges kept by the DejaVu subsets (first, last).
_DEJAVU_COMMON = [
    (0x0020, 0x007E), (0x00A0, 0x024F),   # Basic Latin, Latin-1, Latin Extended-A/B
    (0x0250, 0x02FF),                     # IPA, spacing modifier letters
    (0x0300, 0x036F),                     # combining diacritical marks
    (0x0370, 0x03FF), (0x1F00, 0x1FFF),   # Greek, Greek Extended
    (0x0400, 0x052F),                     # Cyrillic (+ Supplement)
    (0x1E00, 0x1EFF),                     # Latin Extended Additional (Vietnamese …)
    (0x2000, 0x2BFF),                     # punctuation, super/subscripts, currency, letterlike,
                                          # arrows, math, technical, box drawing, shapes,
                                          # symbols, dingbats
]
DEJAVU_SANS_RANGES = _DEJAVU_COMMON + [
    (0x0530, 0x058F),                     # Armenian
    (0x0590, 0x05FF), (0xFB1D, 0xFB4F),   # Hebrew (+ presentation forms)
    (0x10A0, 0x10FF),                     # Georgian
]
DEJAVU_MONO_RANGES = _DEJAVU_COMMON + [
    (0x0600, 0x06FF),                     # Arabic (Persian letters, harakat, digits)
    (0xFB50, 0xFDFF), (0xFE70, 0xFEFF),   # Arabic presentation forms A/B (PdfBuilder shapes to them)
]

FAMILIES = [
    dict(key='vazirmatn', family='Vazirmatn', version='33.003',
         source='https://github.com/rastikerdar/vazirmatn',
         license_file='VAZIRMATN-LICENSE-OFL.txt',
         copyright='Copyright 2015 The Vazirmatn Project Authors (https://github.com/rastikerdar/vazirmatn)',
         regular='vazirmatn/fonts/ttf/Vazirmatn-Regular.ttf',
         bold='vazirmatn/fonts/ttf/Vazirmatn-Bold.ttf',
         italic=None, bolditalic=None,          # None → oblique generated
         dehint=False,                          # no glyph hinting (prep = dropout control only)
         tribute=True,
         notes=(
             'normal / bold : Vazirmatn-Regular.ttf / Vazirmatn-Bold.ttf — unmodified static\n'
             '    TTF files. They carry no glyph hinting (only a small prep program for\n'
             '    dropout control), so they are not dehinted.\n'
             'italic / bold italic : generated for PDF output from those two files by\n'
             '    slanting the outlines 10° (oblique) with fontTools, because Vazirmatn\n'
             '    has no italic. These are Modified Versions under the OFL.')),
    dict(key='sahel', family='Sahel', version='3.4.0',
         source='https://github.com/rastikerdar/sahel-font',
         license_file='SAHEL-LICENSE-OFL.txt',
         copyright='Copyright (c) 2016, Saber Rastikerdar (saber.rastikerdar@gmail.com)',
         regular='sahel/Sahel.ttf', bold='sahel/Sahel-Bold.ttf',
         italic=None, bolditalic=None,
         dehint=True,                           # shipped with ttfautohint hinting
         tribute=True,
         notes=(
             'normal / bold : Sahel.ttf / Sahel-Bold.ttf with the TrueType hinting removed\n'
             '    (fpgm/prep/cvt and glyph instructions; gasp set to smooth rendering).\n'
             '    Some PDF viewers apply hinting and snap the outlines to the pixel\n'
             '    grid, which made Sahel look jagged on screen; outlines are unchanged.\n'
             'italic / bold italic : generated from the dehinted files by slanting\n'
             '    the outlines 10° (oblique) with fontTools, because Sahel has no italic.\n'
             'All four are Modified Versions under the OFL.')),
    dict(key='dejavusans', family='DejaVu Sans', version='2.37', file='dejavu-sans',
         usage="setFonts({ fallback: ['Noto Emoji', 'DejaVu Sans'] })",
         source='https://dejavu-fonts.github.io (dejavu-fonts-ttf-2.37.zip)',
         license_file='DEJAVU-LICENSE.txt',
         copyright=('Fonts are (c) Bitstream (see below). DejaVu changes are in public domain.\n'
                    'Glyphs imported from Arev fonts are (c) Tavmjong Bah (see below).\n'
                    'Copyright (c) 2003 by Bitstream, Inc. All Rights Reserved.\n'
                    'Bitstream Vera is a trademark of Bitstream, Inc.\n'
                    'Copyright (c) 2006 by Tavmjong Bah. All Rights Reserved.'),
         regular='dejavu-fonts-ttf-2.37/ttf/DejaVuSans.ttf',
         bold='dejavu-fonts-ttf-2.37/ttf/DejaVuSans-Bold.ttf',
         italic='dejavu-fonts-ttf-2.37/ttf/DejaVuSans-Oblique.ttf',          # DejaVu's own obliques
         bolditalic='dejavu-fonts-ttf-2.37/ttf/DejaVuSans-BoldOblique.ttf',
         dehint=True,
         subset=DEJAVU_SANS_RANGES,
         notes=(
             'Symbol and multi-script fallback for PdfBuilder (also usable as the latin\n'
             'text font). It has no emoji: pair it with pdf-font-noto-emoji.js (why\n'
             'both: see the PdfBuilder header). Arabic script is left out on purpose —\n'
             'the document font (Vazirmatn, Sahel) covers it.\n'
             'normal / bold / italic / bold italic : DejaVuSans.ttf, -Bold, -Oblique,\n'
             '    -BoldOblique.ttf (DejaVu\'s own obliques) with the TrueType hinting\n'
             '    and the OpenType layout tables removed (jsPDF uses neither), cut down\n'
             '    to Latin (incl. Extended-A/B and Additional: Vietnamese …), Greek,\n'
             '    Cyrillic, Armenian, Hebrew, Georgian, combining marks and U+2000–2BFF\n'
             '    (punctuation, arrows, math, technical, box drawing, shapes, symbols,\n'
             '    dingbats — ✓ → ⚠ ☐ …); outlines unchanged. Complex scripts that\n'
             '    need GSUB/GPOS shaping are not included (jsPDF cannot shape them).\n'
             'These are modified versions; as the license requires, their name\n'
             'contains none of "Bitstream", "Vera", "Arev" or "Tavmjong Bah".'),
         license_text=(
             'Licensed under the Bitstream Vera Fonts license and the Arev Fonts license\n'
             '(DejaVu changes are in the public domain). The full text is in\n'
             'DEJAVU-LICENSE.txt (the package\'s LICENSE file, renamed; content\n'
             'unchanged) next to this file — the copyright, trademark and permission\n'
             'notices must accompany the fonts when this file is redistributed. The\n'
             'fonts may be used, embedded (e.g. in PDF), modified and redistributed;\n'
             'modified fonts must not be named with "Bitstream", "Vera", "Arev" or\n'
             '"Tavmjong Bah"; they may not be sold by themselves.')),
    dict(key='dejavusansmono', family='DejaVu Sans Mono', version='2.37', file='dejavu-sans-mono',
         usage="setFonts({ code: 'DejaVu Sans Mono' })",
         source='https://dejavu-fonts.github.io (dejavu-fonts-ttf-2.37.zip)',
         license_file='DEJAVU-LICENSE.txt',
         copyright=('Fonts are (c) Bitstream (see below). DejaVu changes are in public domain.\n'
                    'Glyphs imported from Arev fonts are (c) Tavmjong Bah (see below).\n'
                    'Copyright (c) 2003 by Bitstream, Inc. All Rights Reserved.\n'
                    'Bitstream Vera is a trademark of Bitstream, Inc.\n'
                    'Copyright (c) 2006 by Tavmjong Bah. All Rights Reserved.'),
         regular='dejavu-fonts-ttf-2.37/ttf/DejaVuSansMono.ttf',
         bold='dejavu-fonts-ttf-2.37/ttf/DejaVuSansMono-Bold.ttf',
         italic='dejavu-fonts-ttf-2.37/ttf/DejaVuSansMono-Oblique.ttf',
         bolditalic='dejavu-fonts-ttf-2.37/ttf/DejaVuSansMono-BoldOblique.ttf',
         dehint=True,
         subset=DEJAVU_MONO_RANGES,
         notes=(
             'Code font for PdfBuilder: every Latin character, digit, symbol and box-\n'
             'drawing glyph has the same width, so code columns line up. Persian /\n'
             'Arabic are KEPT (DejaVu Sans Mono has them, incl. the presentation forms\n'
             'PdfBuilder shapes to): a whole fenced block stays in this font and\n'
             'Persian comments keep the column grid. setCodeBlockOptions({ rtlFont:\n'
             "    'document' }) draws RTL words in code with the document font instead.\n"
             'Hebrew is not in this font; the fallback chain supplies it (DejaVu Sans).\n'
             'normal / bold / italic / bold italic : DejaVuSansMono.ttf, -Bold,\n'
             '    -Oblique, -BoldOblique.ttf with the TrueType hinting and the\n'
             '    OpenType layout tables removed, cut down to the ranges in\n'
             '    DEJAVU_MONO_RANGES; outlines unchanged.\n'
             'These are modified versions; as the license requires, their name\n'
             'contains none of "Bitstream", "Vera", "Arev" or "Tavmjong Bah".'),
         license_text=(
             'Licensed under the Bitstream Vera Fonts license and the Arev Fonts license\n'
             '(DejaVu changes are in the public domain). The full text is in\n'
             'DEJAVU-LICENSE.txt (the package\'s LICENSE file, renamed; content\n'
             'unchanged) next to this file — the copyright, trademark and permission\n'
             'notices must accompany the fonts when this file is redistributed. The\n'
             'fonts may be used, embedded (e.g. in PDF), modified and redistributed;\n'
             'modified fonts must not be named with "Bitstream", "Vera", "Arev" or\n'
             '"Tavmjong Bah"; they may not be sold by themselves.')),
    dict(key='vazircodehack', family='Vazir Code Hack', version='1.1.2', file='vazir-code-hack',
         usage="setFonts({ code: 'Vazir Code Hack' })",
         source='https://github.com/rastikerdar/vazir-code-font (vazir-code-font-v1.1.2.zip, Vazir-Code-Hack.ttf)',
         license_file='VAZIR-CODE-LICENSE.txt',
         copyright=('Changes by Saber Rastikerdar are in public domain.\n'
                    'Glyphs and data from Hack font are licensed under the MIT License\n'
                    '(Copyright 2018 Source Foundry Authors).\n'
                    'Fonts are (c) Bitstream (see below). DejaVu changes are in public domain.\n'
                    'Copyright (c) 2003 by Bitstream, Inc. All Rights Reserved.\n'
                    'Bitstream Vera is a trademark of Bitstream, Inc.'),
         regular='vazir-code/Vazir-Code-Hack.ttf',
         bold='vazir-code/Vazir-Code-Hack.ttf',   # the family has one weight: bold = regular
         italic=None, bolditalic=None,            # None → oblique generated
         dehint=True,
         lam_alef=True,                           # FEF5–FEFC as lam + alef composites (see lam_alef_composites)
         subset=DEJAVU_MONO_RANGES,
         notes=(
             'Default code font for PdfBuilder: a monospace font made for Persian —\n'
             'Vazir letters drawn on the same grid as the Latin of Hack — so code with\n'
             'Persian comments or strings stays readable AND keeps its columns.\n'
             'normal : Vazir-Code-Hack.ttf with the TrueType hinting and the OpenType\n'
             '    layout tables removed, cut down to DEJAVU_MONO_RANGES (Latin, Greek,\n'
             '    Cyrillic, punctuation, arrows, math, box drawing, Arabic and its\n'
             '    presentation forms); outlines unchanged. The mark anchors (harakat)\n'
             '    are read from the source font.\n'
             'lam-alef : U+FEF5–FEFC added as composites of the font\'s own lam and alef\n'
             '    forms on two cells (jsPDF forms these ligatures; the font has none).\n'
             'bold : the same file — Vazir Code has a single weight.\n'
             'italic / bold italic : generated by slanting the outlines 10° (oblique).\n'
             'Known limit of the font itself: ZWNJ and harakat take no width.\n'
             'These are modified versions; as the license requires, their name\n'
             'contains neither "Bitstream" nor "Vera".'),
         license_text=(
             'Vazir Code: changes by Saber Rastikerdar are in the public domain; the Hack\n'
             'glyphs are MIT-licensed; the underlying DejaVu/Bitstream Vera glyphs are\n'
             'under the Bitstream Vera Fonts license. The full text is in\n'
             'VAZIR-CODE-LICENSE.txt (the package\'s LICENSE file, renamed; content\n'
             'unchanged) next to this file. The fonts may be used, embedded (e.g. in\n'
             'PDF), modified and redistributed; modified fonts must not be named with\n'
             '"Bitstream" or "Vera"; they may not be sold by themselves.')),
    dict(key='notoemoji', family='Noto Emoji', version='3.006', file='noto-emoji',
         usage="setFonts({ fallback: ['Noto Emoji', 'DejaVu Sans'] })",
         source='https://github.com/googlefonts/noto-emoji (Google Fonts download, static)',
         license_file='NOTO-EMOJI-LICENSE-OFL.txt',
         copyright='Copyright 2013 Google LLC',
         regular='noto-emoji/static/NotoEmoji-Regular.ttf',
         bold='noto-emoji/static/NotoEmoji-Bold.ttf',
         italic=None, bolditalic=None,          # None → oblique generated
         dehint=False,                          # shipped unhinted
         emoji=True,
         notes=(
             'Monochrome emoji fallback for PdfBuilder >= 1.2.0.\n'
             'normal / bold : NotoEmoji-Regular.ttf / NotoEmoji-Bold.ttf (static wght\n'
             '    400 / 700), remapped for jsPDF, which reads only the BMP cmap and\n'
             '    does no GSUB shaping: every emoji above U+FFFF and every GSUB\n'
             '    ligature (ZWJ sequences, flags, skin tones, keycaps, tag flags) gets\n'
             '    a Private Use Area code point from U+E000 on — `emoji.seq` lists\n'
             '    them in that order (identical in all four styles). GSUB, STAT and\n'
             '    the vertical metrics are removed; outlines are unchanged.\n'
             'italic / bold italic : generated from those two by slanting the outlines\n'
             '    10° (oblique) with fontTools, because Noto Emoji has no italic.\n'
             'All four are Modified Versions under the OFL. The other static weights\n'
             '(Light, Medium, SemiBold) are not built: see "Four styles" in\n'
             'build_pdf_fonts.py.\n'
             'Text copied from the PDF gives the PUA code point for such emoji.')),
]


def dehint(src, dst):
    f = TTFont(src, recalcTimestamp=False)
    for tag in ('fpgm', 'prep', 'cvt ', 'hdmx', 'LTSH', 'VDMX'):
        if tag in f:
            del f[tag]
    glyf = f['glyf']
    for name in f.getGlyphOrder():
        g = glyf[name]
        if hasattr(g, 'program'):
            g.program = ttProgram.Program()
            g.program.fromBytecode(b'')
    if 'gasp' in f:
        f['gasp'].gaspRange = {0xFFFF: 0x000A}      # smooth, no grid-fitting
    f['head'].flags &= ~(1 << 3)                    # don't force integer ppem
    m = f['maxp']
    for a in ('maxZones', 'maxTwilightPoints', 'maxStorage', 'maxFunctionDefs',
              'maxInstructionDefs', 'maxStackElements', 'maxSizeOfInstructions'):
        if hasattr(m, a):
            setattr(m, a, 1 if a == 'maxZones' else 0)
    f.save(dst)


def oblique(src, dst, angle=10):
    f = TTFont(src, recalcTimestamp=False)
    gs, glyf = f.getGlyphSet(), f['glyf']
    t = math.tan(math.radians(angle))
    hmtx = f['hmtx']
    old = {}
    for name in f.getGlyphOrder():                      # xMin before slanting
        g0 = glyf[name]
        if g0.numberOfContours:
            g0.recalcBounds(glyf)
            old[name] = g0.xMin
    # Draw EVERY glyph from the unmodified glyph set first, then replace: a
    # composite drawn after its components were replaced would get them
    # slanted twice (components are decomposed through the glyph set).
    slanted = {}
    for name in f.getGlyphOrder():
        rec = DecomposingRecordingPen(gs)
        gs[name].draw(rec)
        pen = TTGlyphPen(None)
        rec.replay(TransformPen(pen, (1, 0, t, 1, 0, 0)))
        slanted[name] = pen.glyph()
    for name, g in slanted.items():
        g.recalcBounds(glyf)
        glyf[name] = g
        # Keep hmtx lsb in step with the new xMin. TrueType rasterizers (FreeType
        # in poppler/pdfium, Acrobat) place the outline by the lsb (origin =
        # xMin - lsb); a stale lsb shifts every slanted glyph sideways — letters
        # overlap and spaces vanish. Any upstream offset (xMin - lsb) is kept.
        if name in old and g.numberOfContours:
            adv, lsb = hmtx[name]
            hmtx[name] = (adv, g.xMin - (old[name] - lsb))
    f['post'].italicAngle = -angle
    f['head'].macStyle |= 0x02
    os2 = f['OS/2']
    os2.fsSelection = (os2.fsSelection | 0x01) & ~0x40
    fam = f['name'].getDebugName(1)
    sub = ('Bold ' if 'Bold' in (f['name'].getDebugName(2) or '') else '') + 'Italic'
    for r in f['name'].names:
        if r.nameID in (2, 17): r.string = sub
        if r.nameID == 4: r.string = fam + ' ' + sub
        if r.nameID == 6: r.string = fam.replace(' ', '') + '-' + sub.replace(' ', '')
    for tag in ('fpgm', 'prep', 'cvt ', 'hdmx', 'LTSH', 'VDMX'):
        if tag in f:
            del f[tag]
    f.save(dst)


def b64(path):
    with open(path, 'rb') as fh:
        return base64.b64encode(fh.read()).decode()


RULE = ' * ' + '\u2500' * 73 + '\n'


def default_notes(fam):
    """Font notes when a family gives no 'notes' text (one string, \\n-separated)."""
    name, lines = fam['family'], []
    if fam['dehint']:
        lines += ['normal / bold : TrueType hinting removed (fpgm/prep/cvt and glyph',
                  '    instructions; gasp set to smooth rendering); outlines are unchanged.']
    else:
        lines += ['normal / bold : unmodified static TTF files.']
    if fam['italic'] is None:
        lines += ['italic / bold italic : generated by slanting the outlines 10° (oblique)',
                  '    with fontTools, because ' + name + ' has no italic.']
    if fam['dehint'] or fam['italic'] is None or fam.get('subset'):
        lines += ['The modified files are Modified Versions under the OFL.']
    return '\n'.join(lines)


def header(fam):
    """License/usage comment at the top of pdf-font-<key>.js."""
    k, name, ver = fam['key'], fam['family'], fam['version']
    usage = fam.get('usage') or "setFonts({ bidi: '" + name + "' })"
    c = lambda text: ''.join(' *' + (' ' + ln if ln else '') + '\n' for ln in text.split('\n'))
    if fam.get('tribute'):
        font = (name + ' ' + ver + ' — by Saber Rastikerdar (1988–2024), in memory of him.\n'
                'His open-source Persian fonts have served millions of Persian speakers;\n'
                'thank you for your invaluable contribution to the Persian digital community.\n')
    else:
        font = name + ' ' + ver + '\n'
    font += 'Source: ' + fam['source'] + '\n\n' + (fam.get('notes') or default_notes(fam))
    return (
        '/**\n'
        + c('PdfFonts — ' + name + ' ' + ver + ' for PdfBuilder (jsPDF virtual file system)\n'
            + '=' * 74 + '\n'
            '\n'
            'Usage (load after jsPDF, before building):\n'
            '    <script src="pdf-font-' + fam.get('file', k) + '.js"></script>\n'
            '    PdfBuilder.create().registerFonts(PdfFonts).' + usage + '\n'
            'Every pdf-font-*.js file adds one family to the global `PdfFonts`, so an\n'
            'app loads only the families it uses; registerFonts(PdfFonts) registers all\n'
            'loaded ones. Only the styles actually drawn are embedded in the PDF, each as\n'
            'a subset of the glyphs used (PdfBuilder creates jsPDF with putOnlyUsedFonts).\n'
            '\n'
            + ('Format: PdfFonts.' + k + ' = { family, version, styles: { normal, bold, italic,\n'
               '        bolditalic: { vfsName, data (base64 TTF) } } }\n'
               if not fam.get('emoji') and fam['italic'] is not False else
               'Format: PdfFonts.' + k + ' = { family, version, styles: { normal, bold:\n'
               '        { vfsName, data (base64 TTF) } } }\n'
               if not fam.get('emoji') else
               'Format: PdfFonts.' + k + ' = { family, version, styles: { normal, bold, italic,\n'
               '        bolditalic: { vfsName, data (base64 TTF) } }, emoji: { pua, seq } }\n'))
        + RULE + ' * FONT\n' + RULE + ' *\n'
        + c(font) + ' *\n'
        + RULE + ' * LICENSE\n' + RULE + ' *\n'
        + c(fam['copyright'] + '\n'
            '\n'
            + (fam.get('license_text') or
            'This Font Software is licensed under the SIL Open Font License, Version 1.1\n'
            '(no Reserved Font Name). The full license text is in ' + fam['license_file'] + '\n'
            "(the font's original license file, renamed; content unchanged) next to this\n"
            'file and at https://openfontlicense.org — it must accompany the fonts when\n'
            'this file is redistributed. The fonts may be used, embedded (e.g. in PDF),\n'
            'modified and redistributed; they may not be sold by themselves.'))
        + ' */\n')


def marks_js(marks):
    """`marks` object: per style anchors, or the name of the upright style
    whose anchors a generated oblique reuses (slanted by `slant`)."""
    import json
    out = {'slant': round(math.tan(math.radians(10)), 6), 'styles': {}}
    for st, v in marks.items():
        if isinstance(v, str):
            out['styles'][st] = v
            continue
        out['styles'][st] = {
            'upem': v['upem'],
            'mark': {'%X' % c: e for c, e in sorted(v['mark'].items())},
            'base': {'%X' % c: e for c, e in sorted(v['base'].items())},
            'mark2': {'%X' % c: e for c, e in sorted(v['mark2'].items())},
        }
    return json.dumps(out, separators=(',', ':'), ensure_ascii=True)


def body(fam, reg, bold, it, bi, seq=None, marks=None):
    k, name = fam['key'], fam['family']
    base = name.replace(' ', '')
    rows = [('normal:    ', '-Regular.ttf', reg), ('bold:      ', '-Bold.ttf', bold),
            ('italic:    ', '-Italic.ttf', it), ('bolditalic:', '-BoldItalic.ttf', bi)]
    lines = []
    for label, suffix, path in rows:
        if not path:
            continue
        pad = ' ' * (len('-BoldItalic.ttf') - len(suffix))
        lines.append(f"            {label} {{ vfsName: '{base}{suffix}',{pad} data: '{b64(path)}' }}")
    styles = ',\n'.join(lines)
    extra = ''
    if marks:
        extra += (",\n        // GPOS mark attachment (harakat, points) — jsPDF ignores GPOS; PdfBuilder\n"
                  "        // places marks with these anchors. Keys: hex code points; classes per subtable.\n"
                  "        marks: " + marks_js(marks))
    if seq:
        packed = ';'.join(' '.join('%X' % c for c in cps) for cps in seq)
        extra += (",\n        // emoji → PUA: entry i (hex code points, FE0F removed) is drawn as U+E000 + i\n"
                 "        emoji: { pua: 0xE000, seq: '" + packed + "' }")
    return f"""(function (global) {{
    'use strict';
    var PdfFonts = global.PdfFonts = global.PdfFonts || {{}};
    PdfFonts.{k} = {{
        family: '{name}',
        version: '{fam['version']}',
        styles: {{
{styles}
        }}{extra}
    }};
    if (typeof module !== 'undefined' && module.exports) module.exports = PdfFonts;
}})(typeof window !== 'undefined' ? window : this);
"""


def lam_alef_composites(path):
    """Add U+FEF5–FEFC (lam-alef ligatures) as composites of the font's own
    lam + alef presentation forms, side by side on a two-cell advance. jsPDF
    turns lam + alef into these ligature code points by itself; a font without
    them (Vazir Code draws lam and alef apart, as a monospace font should)
    would lose «لا». Visual order: alef on the left, lam on the right."""
    from fontTools.ttLib.tables._g_l_y_f import Glyph, GlyphComponent
    f = TTFont(path)
    cmap = f.getBestCmap()
    pairs = {0xFEF5: (0xFEDF, 0xFE82), 0xFEF6: (0xFEE0, 0xFE82), 0xFEF7: (0xFEDF, 0xFE84),
             0xFEF8: (0xFEE0, 0xFE84), 0xFEF9: (0xFEDF, 0xFE88), 0xFEFA: (0xFEE0, 0xFE88),
             0xFEFB: (0xFEDF, 0xFE8E), 0xFEFC: (0xFEE0, 0xFE8E)}
    glyf, hmtx = f['glyf'], f['hmtx']
    added = 0
    for cp, (lam, alef) in pairs.items():
        if cp in cmap or lam not in cmap or alef not in cmap:
            continue
        gl, ga = cmap[lam], cmap[alef]
        wa = hmtx[ga][0]
        name = 'lamalef.%04X' % cp
        g = Glyph(); g.numberOfContours = -1; g.components = []
        for gname, x in ((ga, 0), (gl, wa)):
            c = GlyphComponent(); c.glyphName = gname; c.x = x; c.y = 0; c.flags = 0x4 if gname == ga else 0
            g.components.append(c)
        glyf[name] = g                          # also appends the name to the glyph order
        hmtx[name] = (wa + hmtx[gl][0], 0)
        for t in f['cmap'].tables:
            if t.isUnicode():
                t.cmap[cp] = name
        added += 1
    f.setGlyphOrder(list(glyf.glyphOrder))
    for n in glyf.glyphOrder:
        if n.startswith('lamalef.'):
            glyf[n].recalcBounds(glyf)
            hmtx[n] = (hmtx[n][0], glyf[n].xMin)       # lsb = xMin, or renderers shift the glyph
    f.save(path)
    return added


def subset_font(path, ranges):
    """Keep only these code point ranges; drop hinting and OpenType layout tables."""
    f = TTFont(path, recalcTimestamp=False)
    o = ftsubset.Options()
    o.hinting = False
    o.layout_features = []
    o.drop_tables += ['GSUB', 'GPOS', 'GDEF', 'kern', 'FFTM']
    o.name_IDs, o.name_languages = ['*'], ['*']
    o.notdef_outline, o.glyph_names = True, False
    s = ftsubset.Subsetter(o)
    s.populate(unicodes=[c for a, b in ranges for c in range(a, b + 1)])
    s.subset(f)
    f.save(path)


def ligatures(font):
    """GSUB ligatures (type 4, also inside type 7 extensions) → {glyph tuple: glyph}."""
    out = {}
    if 'GSUB' not in font:
        return out
    for lk in font['GSUB'].table.LookupList.Lookup:
        for st in lk.SubTable:
            t = st.ExtSubTable if lk.LookupType == 7 else st
            for first, ligs in (getattr(t, 'ligatures', None) or {}).items():
                for lg in ligs:
                    out.setdefault((first,) + tuple(lg.Component), lg.LigGlyph)
    return out


def emoji_remap(path):
    """
    Give every emoji jsPDF cannot reach a BMP Private Use Area code point.
    Returns the sequence list: entry i (code points, FE0F removed) ↔ U+E000 + i.
    """
    f = TTFont(path, recalcTimestamp=False)
    cmap = f.getBestCmap()
    rev = {}
    for cp, g in sorted(cmap.items()):
        rev.setdefault(g, cp)
    singles = sorted(cp for cp in cmap if 0xFFFF < cp < 0xF0000)       # skip planes 15/16 (font-private)
    seqs = []
    for glyphs, lig in ligatures(f).items():
        cps = tuple(rev[g] for g in glyphs if g in rev and rev[g] != 0xFE0F)
        if len(cps) == len([g for g in glyphs if rev.get(g) != 0xFE0F]) and len(cps) > 1:
            seqs.append((cps, lig))
    seqs.sort()
    entries = [((cp,), cmap[cp]) for cp in singles] + seqs
    if len(entries) > 0xF8FF - 0xE000 + 1:
        raise SystemExit('emoji: %d entries do not fit the BMP PUA' % len(entries))
    newmap = {cp: g for cp, g in cmap.items() if cp <= 0xFFFF and not 0xE000 <= cp <= 0xF8FF}
    for i, (cps, g) in enumerate(entries):
        newmap[0xE000 + i] = g
    from fontTools.ttLib.tables._c_m_a_p import CmapSubtable
    tables = []
    for pid, eid in ((0, 3), (3, 1)):
        t = CmapSubtable.newSubtable(4)
        t.platformID, t.platEncID, t.language, t.cmap = pid, eid, 0, dict(newmap)
        tables.append(t)
    f['cmap'].tables = tables
    for tag in ('GSUB', 'GPOS', 'GDEF', 'STAT', 'vhea', 'vmtx'):
        if tag in f:
            del f[tag]
    f.save(path)
    # drop glyphs nothing maps to any more
    g = TTFont(path, recalcTimestamp=False)
    o = ftsubset.Options()
    o.hinting, o.layout_features, o.notdef_outline, o.glyph_names = False, [], True, False
    o.name_IDs, o.name_languages = ['*'], ['*']
    ss = ftsubset.Subsetter(o)
    ss.populate(unicodes=list(newmap))
    ss.subset(g)
    g.save(path)
    return [e[0] for e in entries]


def mark_anchors(path):
    """
    GPOS mark attachment for PdfBuilder (jsPDF ignores GPOS): MarkBasePos
    (mark → base) and MarkMarkPos (mark → preceding mark), incl. extension
    lookups; ligature attachment (MarkLigPos) is left out. Keyed by code point
    (jsPDF draws by code point), anchor classes namespaced per subtable.
    Returns None when the font has no such data for encoded glyphs.
      { upem, mark: {cp: [[key, x, y], …]},  base: {cp: {key: [x, y]}},
        mark2: {cp: {key: [x, y]}} }
    """
    f = TTFont(path)
    if 'GPOS' not in f:
        return None
    cmap = f.getBestCmap()
    cps = {}
    for cp, g in sorted(cmap.items()):
        if cp <= 0xFFFF:
            cps.setdefault(g, []).append(cp)
    mark, base, mark2 = {}, {}, {}
    for li, lk in enumerate(f['GPOS'].table.LookupList.Lookup):
        for si, st in enumerate(lk.SubTable):
            t = lk.LookupType
            if t == 9:
                t, st = st.ExtensionLookupType, st.ExtSubTable
            if t not in (4, 6):
                continue
            ns = '%d.%d.' % (li, si)
            if t == 4:
                mcov, marr = st.MarkCoverage.glyphs, st.MarkArray.MarkRecord
                bcov, barr = st.BaseCoverage.glyphs, st.BaseArray.BaseRecord
                banch, target = 'BaseAnchor', base
            else:
                mcov, marr = st.Mark1Coverage.glyphs, st.Mark1Array.MarkRecord
                bcov, barr = st.Mark2Coverage.glyphs, st.Mark2Array.Mark2Record
                banch, target = 'Mark2Anchor', mark2
            for g, rec in zip(mcov, marr):
                a = rec.MarkAnchor
                for cp in cps.get(g, []):
                    mark.setdefault(cp, [])
                    k = ns + str(rec.Class)
                    if not any(e[0] == k for e in mark[cp]):
                        mark[cp].append([k, a.XCoordinate, a.YCoordinate])
            for g, rec in zip(bcov, barr):
                for cls, a in enumerate(getattr(rec, banch)):
                    if a is None:
                        continue
                    for cp in cps.get(g, []):
                        target.setdefault(cp, {}).setdefault(ns + str(cls), [a.XCoordinate, a.YCoordinate])
    if not mark or not (base or mark2):
        return None
    return {'upem': f['head'].unitsPerEm, 'mark': mark, 'base': base, 'mark2': mark2}


def build(fam):
    os.makedirs(OUT, exist_ok=True)
    k, name = fam['key'], fam['family']
    base = os.path.join(OUT, name.replace(' ', ''))
    paths = {st: base + suffix for st, suffix in
             (('regular', '-Regular.ttf'), ('bold', '-Bold.ttf'),
              ('italic', '-Italic.ttf'), ('bolditalic', '-BoldItalic.ttf'))}
    # 1. given files: dehint or copy, subset, emoji remap — all styles alike
    seqs, marks = [], {}
    jsname = {'regular': 'normal', 'bold': 'bold', 'italic': 'italic', 'bolditalic': 'bolditalic'}
    for st in ('regular', 'bold', 'italic', 'bolditalic'):
        src = fam[st]
        if not src:                                     # None → oblique later, False → omitted
            continue
        dst = paths[st]
        anchors = mark_anchors(src)                     # from the source: subsetting drops GPOS
        if fam['dehint']:
            dehint(src, dst)
        else:
            shutil.copyfile(src, dst)                   # byte-identical
        if fam.get('lam_alef'):
            lam_alef_composites(dst)                    # before subsetting (it keeps cmap'd glyphs)
        if fam.get('subset'):
            subset_font(dst, fam['subset'])
        if fam.get('emoji'):
            seqs.append(emoji_remap(dst))
        if anchors:
            keep = set(TTFont(dst).getBestCmap())       # code points the shipped style has
            anchors['mark'] = {c: v for c, v in anchors['mark'].items() if c in keep}
            anchors['base'] = {c: v for c, v in anchors['base'].items() if c in keep}
            anchors['mark2'] = {c: v for c, v in anchors['mark2'].items() if c in keep}
            if anchors['mark'] and (anchors['base'] or anchors['mark2']):
                marks[jsname[st]] = anchors
    if any(x != seqs[0] for x in seqs):
        raise SystemExit('emoji: the styles of %s have different PUA lists' % name)
    # 2. missing italics: slant the processed upright styles (keeps cmap/PUA)
    if fam['italic'] is None: oblique(paths['regular'], paths['italic'])
    if fam['bolditalic'] is None: oblique(paths['bold'], paths['bolditalic'])
    # generated obliques reuse the upright anchors, slanted like the outlines
    if fam['italic'] is None and 'normal' in marks: marks['italic'] = 'normal'
    if fam['bolditalic'] is None and 'bold' in marks: marks['bolditalic'] = 'bold'
    use = {st: (paths[st] if fam[st] is not False else None) for st in paths}
    if not fam['regular']: use['regular'] = None
    if not fam['bold']: use['bold'] = None

    js = header(fam) + body(fam, use['regular'], use['bold'], use['italic'], use['bolditalic'],
                            seqs[0] if seqs else None, marks or None)
    out = 'pdf-font-%s.js' % fam.get('file', k)
    with open(out, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(js)
    print('%s  %d KB' % (out, len(js) // 1024))

if __name__ == '__main__':
    # Work in lib/pdf-base64-ttf-fonts: the source paths in FAMILIES, the license
    # files and the pdf-font-*.js outputs are all relative to that folder.
    import os, sys
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lib', 'pdf-base64-ttf-fonts'))
    wanted = set(sys.argv[1:])                   # optional: build only these keys (e.g. vazircodehack)
    for fam in FAMILIES:
        if not wanted or fam['key'] in wanted:
            build(fam)
