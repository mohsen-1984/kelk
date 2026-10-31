# Four pages of a typeset book's front matter, as a typesetter's PDF library writes them — built by hand, each habit on
# purpose, with our own text:
#   · a table of contents over two pages (a verso filled to its foot, the recto going on) whose dot leaders are the body font's period, its code mapped to U+FFFD in the font's
#     ToUnicode (every other ASCII code to itself), each leader run wrapped in an /ActualText of a control character
#     (U+0008: the tab the leader stood for); entries at three depths, page numbers flush right; the chapter entries
#     and the last one in a bold face — its period mapped to U+FFFD too; the verso's last entry and the recto's first
#     each a line of its own (they ran together across the page break); a running head «TABLE OF CONTENTS» and roman folios,
#     marked as pagination artifacts (gone from the text)
#   · two "about" pages, rectos: the margins mirrored — the measure as wide as the contents verso's, 18 pt further
#     right; a portrait (a picture) at the left margin beside the first lines of a biography, the lines set
#     in to its right edge; the text runs on under the picture at the margin — on the second page after a line that
#     ends well short of the far side
# Simple Type 1 fonts (the standard 14, not embedded, WinAnsiEncoding, /Widths from their metrics).
# The Markdown that must come back is corpus/book-front.md.
#   python3 scripts/make-book-toc.py      → pdf/producers/pdflib-book--book-front.pdf (corpus/book-front.md is kept by hand)
import os, sys, zlib
sys.dont_write_bytecode = True
from reportlab.pdfbase.pdfmetrics import stringWidth

LAB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 504, 720
FONTS = {'F1': 'Helvetica', 'F2': 'Helvetica-Bold', 'F3': 'Times-Roman', 'F4': 'Times-Bold'}
LEADER_FFFD = {'F1', 'F2'}          # the fonts whose period maps to U+FFFD

TOC = [  # (depth, title, page, font, size): two pages of contents, a verso filled to its foot, then a recto
    (1, 'Reading the Catalog as a Leader', '92', 'F1', 10),
    (1, 'Risk and Reward in Small Archives', '97', 'F1', 10),
    (1, 'Practitioner’s Notes', '103', 'F1', 10),
    (2, 'A Note on Formats', '103', 'F1', 10),
    (2, 'The CLEAR Lens for Choosing Tools', '104', 'F1', 10),
    (1, 'Summary', '106', 'F1', 10),
    (1, 'Practice Questions', '109', 'F1', 10),
    (0, 'Chapter 4: Platforms and Their Habits', '117', 'F2', 11),
    (1, 'Introduction', '117', 'F1', 10),
    (1, 'Mapping the Tools You Already Have', '119', 'F1', 10),
    (1, 'Shared Drives and Their Limits', '122', 'F1', 10),
    (1, 'Search That Works', '126', 'F1', 10),
    (1, 'Custom Tools and When to Build Them', '130', 'F1', 10),
    (1, 'Choosing the Right Tool', '134', 'F1', 10),
    (1, 'The FIT Checklist', '137', 'F1', 10),
    (2, 'F—Familiar Steps', '138', 'F1', 10),
    (2, 'I—Interfaces and Imports', '138', 'F1', 10),
    (2, 'T—Tailored Views', '139', 'F1', 10),
    (1, 'Practitioner’s Notes', '143', 'F1', 10),
    (1, 'Summary', '147', 'F1', 10),
    (0, 'Chapter 5: Data, Questions and Readiness', '155', 'F2', 11),
    (1, 'Introduction', '155', 'F1', 10),
    (1, 'Understanding Collection Data', '163', 'F1', 10),
    'PAGE',
    (1, 'Access, Privacy and Retention', '167', 'F1', 10),
    (1, 'Grounding Answers in the Catalog', '170', 'F1', 10),
    (1, 'Asking Good Questions of Data', '174', 'F1', 10),
    (2, 'R—Review and Reflection', '187', 'F1', 10),
    (2, 'S—Systems at Scale', '187', 'F1', 10),
    (1, 'Closing Remarks', '198', 'F1', 10),
    (0, 'Index', '201', 'F2', 11),
]
BIO = [
    ('About the Author', [('F4', 'Mina Darvish'), ('F3', ' is a data architect and teacher who has spent fifteen years building'
      ' reporting systems for public libraries and small museums. She writes a monthly column on open data, mentors new'
      ' analysts through a volunteer network, and speaks at regional conferences on catalog design. She currently leads'
      ' the archive services team at a city library, where her work brings digital collections and reading rooms closer'
      ' together. She is the author of two practical guides on metadata and lives near the coast, where she volunteers'
      ' at a small maritime museum and catalogs its collection of ship logs, letters and harbour maps.')]),
    ('About the Technical Reviewer', [('F4', 'Omid Rahnama'), ('F3', ' is a software engineer and a long-time reviewer of'
      ' technical books. Over a career spanning research labs, a ferry company and two weather services, he has built'
      ' scheduling tools, booking systems and data pipelines for timetables, tide tables and forecasts that run'
      ' quietly in the background'),
     ('F3', '#BREAK#'),
     ('F3', 'every hour of the day. He now leads a small platform group, where he looks after the tools other teams'
      ' build on, and he teaches an evening course on testing. In his spare time he restores old radios and keeps a'
      ' small garden of herbs on his balcony, which he says has taught him more about patience than any project.')]),
]

def w(text, f, size): return stringWidth(text, FONTS[f], size)
def winansi(s):
    out = b''
    for ch in s:
        c = {'—': 0x97, '’': 0x92, '–': 0x96}.get(ch, ord(ch))
        assert c < 256, ch
        out += bytes([c])
    return out
def esc(b): return b.replace(b'\\', b'\\\\').replace(b'(', b'\\(').replace(b')', b'\\)')
def text(f, size, x, y, s, extra=b''):
    return b'BT /' + f.encode() + b' ' + str(size).encode() + b' Tf ' + extra + ('%.2f %.2f Td (' % (x, y)).encode() + esc(winansi(s)) + b') Tj ET\n'

pages = []
# ── pages 1 and 2: the contents, a verso and a recto (its measure 18 pt to the right) ──
def contents_page(entries, shift, folio, fx):
    c = b'0 g\n/Artifact <</Type /Pagination /Subtype /Header>> BDC\n' + text('F1', 8, 36 + shift, 668, 'TABLE OF CONTENTS') + b'EMC\n'
    y = 630
    for depth, title, num, f, size in entries:
        x0 = 36 + shift + (12 + 14 * (depth - 1) if depth else 0)
        if depth == 0: y -= 6
        c += b'0 0 0.8 rg\n'
        c += text(f, size, x0, y, title + ' ')     # (the word space after the title drawn)
        nw = w(num, f, size); right = 468 + shift
        # (the leader runs from a word space after the title right up to the number, as a tab leader is set)
        dw = w('.', f, size); n = int((right - nw - (x0 + w(title + ' ', f, size))) // dw)
        lx = right - nw - n * dw
        c += b'/Span <</ActualText <FEFF0008>>> BDC\n' + text(f, size, lx, y, '.' * n) + b'EMC\n'
        c += text(f, size, right - nw, y, num)
        y -= 25 if depth == 0 else 19
    c += b'0 g\n/Artifact <</Type /Pagination /Subtype /Footer>> BDC\n' + text('F3', 9, fx, 40, folio) + b'EMC\n'
    return c
k = TOC.index('PAGE')
pages.append((contents_page(TOC[:k], 0, 'x', 36), None))
pages.append((contents_page(TOC[k + 1:], 18, 'xi', 476), None))
assert 630 - 19 * (k - 1) - 9 > 60, 'the verso must fill to its foot, not past it'

# ── pages 2 and 3: the "about" pages ──
def flow(runs, x_beside, x_left, right, top, pic_bottom, size, lead):
    """lines beside the picture (x_beside..right) while above pic_bottom, then x_left..right; '#BREAK#' ends a line"""
    words = []
    for f, s in runs:
        if s == '#BREAK#': words.append(('BR', None)); continue
        for k, t in enumerate(s.split(' ')):
            if t: words.append((f, t if not words or s.startswith(' ') or k else t))
    out, y, line, lw = [], top, [], 0
    def x0(): return x_beside if y > pic_bottom else x_left
    def flush(justify):
        nonlocal y, line, lw
        if line: out.append((x0(), y, line, (right - x0() - lw) / (len(line) - 1) if justify and len(line) > 1 else 0))
        y -= lead; line, lw = [], 0
    for f, t in words:
        if f == 'BR': flush(False); continue
        ww = w(t, f, size) + (w(' ', f, size) if line else 0)
        if lw + ww > right - x0(): flush(True); ww = w(t, f, size)
        line.append((f, t)); lw += ww
    flush(False)
    return out
for title, runs in BIO:
    c = b'0 g\n' + text('F2', 22, 54, 600, title)
    c += b'q 120 0 0 100 54 445 cm /Im1 Do Q\n'
    # (justified, as a book is set: each word placed, the word space stretched; the line before a break and a
    # paragraph's last line ragged)
    for x, y, line, extra in flow(runs, 186, 54, 486, 534, 445, 10, 13.5):
        xx = x
        for k, (f, t) in enumerate(line):
            s = (' ' if k else '') + t
            if k: xx += extra
            c += text(f, 10, xx, y, s); xx += w(s, f, 10)
    c += b'/Artifact <</Type /Pagination /Subtype /Footer>> BDC\n' + text('F3', 9, 476, 40, 'xiii' if title.endswith('Author') else 'xv') + b'EMC\n'
    pages.append((c, 'Im1'))

# ── the file ──
objs = []
def obj(b): objs.append(b); return len(objs)
def stream(data, extra=b''):
    z = zlib.compress(data)
    return obj(b'<< /Length ' + str(len(z)).encode() + b' /Filter /FlateDecode' + extra + b' >>\nstream\n' + z + b'\nendstream')
def tounicode(fffd):
    lines = []
    for code in range(0x20, 0x7F):
        u = 0xFFFD if (fffd and code == 0x2E) else code
        lines.append(b'<%02X> <%04X>' % (code, u))
    for code, u in ((0x92, 0x2019), (0x96, 0x2013), (0x97, 0x2014)): lines.append(b'<%02X> <%04X>' % (code, u))
    body = (b'/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CMapName /Adobe-Identity-UCS def /CMapType 2 def\n'
            b'1 begincodespacerange <00> <FF> endcodespacerange\n')
    for i in range(0, len(lines), 100):
        chunk = lines[i:i + 100]
        body += str(len(chunk)).encode() + b' beginbfchar\n' + b'\n'.join(chunk) + b'\nendbfchar\n'
    return stream(body + b'endcmap CMapName currentdict /CMap defineresource pop end end')
fids = {}
for k, base in FONTS.items():
    widths = []
    for code in range(32, 256):
        try: ch = bytes([code]).decode('cp1252')
        except UnicodeDecodeError: ch = ' '
        widths.append(str(round(stringWidth(ch, base, 1000))).encode())
    tu = tounicode(k in LEADER_FFFD)
    fids[k] = obj(b'<< /Type /Font /Subtype /Type1 /BaseFont /' + base.encode() + b' /Encoding /WinAnsiEncoding /FirstChar 32 /LastChar 255'
                  b' /Widths [' + b' '.join(widths) + b'] /ToUnicode ' + str(tu).encode() + b' 0 R >>')
# a portrait: a grey picture with a lighter band (8 × 10 pixels, scaled)
px = bytes([150 if 3 <= r <= 6 else 90 for r in range(10) for _ in range(8)])
img = stream(px, b' /Type /XObject /Subtype /Image /Width 8 /Height 10 /ColorSpace /DeviceGray /BitsPerComponent 8')
fontres = b'/Font << ' + b' '.join(b'/' + k.encode() + b' ' + str(v).encode() + b' 0 R' for k, v in fids.items()) + b' >>'
pages_id = len(objs) + 1 + 2 * len(pages)
kids = []
for content, im in pages:
    cid = stream(content)
    res = b'<< ' + fontres + (b' /XObject << /Im1 ' + str(img).encode() + b' 0 R >>' if im else b'') + b' >>'
    kids.append(obj(b'<< /Type /Page /Parent ' + str(pages_id).encode() + b' 0 R /MediaBox [0 0 %d %d] /Resources ' % (W, H) + res +
                    b' /Contents ' + str(cid).encode() + b' 0 R >>'))
assert len(objs) + 1 == pages_id, (len(objs), pages_id)
obj(b'<< /Type /Pages /Kids [' + b' '.join(str(k).encode() + b' 0 R' for k in kids) + b'] /Count ' + str(len(kids)).encode() + b' >>')
info = obj(b'<< /Producer (Adobe PDF Library 10.0.1) /Creator (Adobe InDesign 18.0 \\(Windows\\)) /Title (Front matter) >>')
cat = obj(b'<< /Type /Catalog /Pages ' + str(pages_id).encode() + b' 0 R /MarkInfo << /Marked true >> >>')
out = b'%PDF-1.6\n%\xe2\xe3\xcf\xd3\n'; offs = []
for i, b in enumerate(objs, 1): offs.append(len(out)); out += str(i).encode() + b' 0 obj\n' + b + b'\nendobj\n'
x = len(out)
out += b'xref\n0 ' + str(len(objs) + 1).encode() + b'\n0000000000 65535 f \n' + b''.join(b'%010d 00000 n \n' % o for o in offs)
out += b'trailer\n<< /Size ' + str(len(objs) + 1).encode() + b' /Root ' + str(cat).encode() + b' 0 R /Info ' + str(info).encode() + b' 0 R >>\nstartxref\n' + str(x).encode() + b'\n%%EOF\n'
dst = os.path.join(LAB, 'pdf', 'producers', 'pdflib-book--book-front.pdf')
open(dst, 'wb').write(out)
print(dst)
