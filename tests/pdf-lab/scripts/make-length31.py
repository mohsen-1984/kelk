# A stream whose length is a reference: «/Length 12 0 R», the number in an object of its own after the stream, as
# LibreOffice writes every stream. Kelk read a reference to an object numbered 10 or more as a length of 1 and lost
# the stream: the page's content was never read for its /ActualText, and the letters only the ActualText names were
# lost (3.1, pdf/3.1-stream-length).
# Built by hand, with our own text:
#   · two pages of a short English service note in Helvetica, its bold and its oblique (the standard 14, not
#     embedded, WinAnsiEncoding; each with a ToUnicode naming every code as itself)
#   · «fi», «fl» and «ff» drawn as ligatures: their letters set in a fourth font (Helvetica again) whose ToUnicode
#     names f, i and l as private-use characters, each pair wrapped in a /Span with its /ActualText — the only place
#     the file names those letters (a ligature glyph with no Unicode of its own)
#   · each page's content stream Flate-compressed, its /Length a reference to the object right after it: page 1's
#     object 2 (read right before 3.1), page 2's object 12 («/Length 12 0 R», read as a length of 1)
# The Markdown that must come back is corpus/length-ref.md.
#   python3 scripts/make-length31.py      → pdf/producers/loref--length-ref.pdf (corpus/length-ref.md is kept by hand)
import os, re, sys, zlib
sys.dont_write_bytecode = True
from reportlab.pdfbase.pdfmetrics import stringWidth

LAB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 595, 842
FONTS = {'F1': 'Helvetica', 'F2': 'Helvetica-Bold', 'F3': 'Helvetica-Oblique', 'F4': 'Helvetica'}
LIG = 'F4'                                  # the ligatures' font: f, i and l named as private-use characters
PUA = {'f': 0xE000, 'i': 0xE001, 'l': 0xE002}

PAGES = [  # (font, size, text): one line each, a paragraph each
    [('F2', 18, 'Service note, October check-up'),
     ('F3', 11, 'Date: 2026-10-14'),
     ('F1', 11, 'The first visit found the pump in good order and the filter half full.'),
     ('F1', 11, 'The office staff confirmed the flow rate on the official form.')],
    [('F1', 11, 'A self test ran for fifteen minutes with no error and no difference in flow.'),
     ('F2', 13, 'Next steps'),
     ('F1', 11, 'Replace the filter before the final visit and fill in the field log.')],
]

def esc(b): return b.replace(b'\\', b'\\\\').replace(b'(', b'\\(').replace(b')', b'\\)')
def run(f, size, x, y, s):
    return b'BT /' + f.encode() + b' ' + str(size).encode() + b' Tf ' + ('%.2f %.2f Td (' % (x, y)).encode() + esc(s.encode('cp1252')) + b') Tj ET\n'

def content(lines):
    c = b'0 g\n'
    y = H - 90
    for f, size, s in lines:
        x = 72
        # in body lines, each «fi», «fl», «ff» in the ligatures' font, wrapped in a /Span with its /ActualText
        for part in (re.split(r'(f[fil])', s) if f == 'F1' else [s]):
            if not part: continue
            if f == 'F1' and re.fullmatch(r'f[fil]', part):
                c += b'/Span <</ActualText <FEFF' + ''.join('%04X' % ord(ch) for ch in part).encode() + b'>>> BDC\n' + run(LIG, size, x, y, part) + b'EMC\n'
            else:
                c += run(f, size, x, y, part)
            x += stringWidth(part, FONTS[f], size)
        y -= size * 2.4
    return c

# ── the file ──
objs = []
def obj(b): objs.append(b); return len(objs)
def stream(data):
    z = zlib.compress(data)
    return obj(b'<< /Length ' + str(len(z)).encode() + b' /Filter /FlateDecode >>\nstream\n' + z + b'\nendstream')
def tounicode(lig):
    lines = [b'<%02X> <%04X>' % (code, PUA.get(chr(code), code) if lig else code) for code in range(0x20, 0x7F)]
    body = (b'/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CMapName /Adobe-Identity-UCS def /CMapType 2 def\n'
            b'1 begincodespacerange <00> <FF> endcodespacerange\n')
    for i in range(0, len(lines), 100):
        chunk = lines[i:i + 100]
        body += str(len(chunk)).encode() + b' beginbfchar\n' + b'\n'.join(chunk) + b'\nendbfchar\n'
    return stream(body + b'endcmap CMapName currentdict /CMap defineresource pop end end')
cids = []
def page_stream(lines):
    # a page's content stream, its length a reference to the object right after it (LibreOffice's way)
    z = zlib.compress(content(lines))
    cids.append(len(objs) + 1)
    obj(b'<< /Length ' + str(cids[-1] + 1).encode() + b' 0 R /Filter /FlateDecode >>\nstream\n' + z + b'\nendstream')
    obj(str(len(z)).encode())
page_stream(PAGES[0])                               # objects 1 and 2: «/Length 2 0 R»
fids = {}
for k, base in FONTS.items():
    widths = [str(round(stringWidth(chr(code), base, 1000))).encode() for code in range(32, 127)]
    tu = tounicode(k == LIG)
    fids[k] = obj(b'<< /Type /Font /Subtype /Type1 /BaseFont /' + base.encode() + b' /Encoding /WinAnsiEncoding /FirstChar 32 /LastChar 126'
                  b' /Widths [' + b' '.join(widths) + b'] /ToUnicode ' + str(tu).encode() + b' 0 R >>')
fontres = b'/Font << ' + b' '.join(b'/' + k.encode() + b' ' + str(v).encode() + b' 0 R' for k, v in fids.items()) + b' >>'
page_stream(PAGES[1])                               # objects 11 and 12: «/Length 12 0 R»
assert cids[0] + 1 < 10 <= cids[-1] + 1, cids     # one reference of one digit, one of two
pages_id = len(objs) + len(PAGES) + 1
kids = [obj(b'<< /Type /Page /Parent ' + str(pages_id).encode() + b' 0 R /MediaBox [0 0 %d %d] /Resources << ' % (W, H) + fontres +
            b' >> /Contents ' + str(cid).encode() + b' 0 R >>') for cid in cids]
obj(b'<< /Type /Pages /Kids [' + b' '.join(str(k).encode() + b' 0 R' for k in kids) + b'] /Count ' + str(len(kids)).encode() + b' >>')
info = obj(b'<< /Producer (LibreOffice 24.2) /Creator (Writer) /Title (Service note) >>')
cat = obj(b'<< /Type /Catalog /Pages ' + str(pages_id).encode() + b' 0 R /MarkInfo << /Marked true >> >>')
out = b'%PDF-1.6\n%\xe2\xe3\xcf\xd3\n'; offs = []
for i, b in enumerate(objs, 1): offs.append(len(out)); out += str(i).encode() + b' 0 obj\n' + b + b'\nendobj\n'
x = len(out)
out += b'xref\n0 ' + str(len(objs) + 1).encode() + b'\n0000000000 65535 f \n' + b''.join(b'%010d 00000 n \n' % o for o in offs)
out += b'trailer\n<< /Size ' + str(len(objs) + 1).encode() + b' /Root ' + str(cat).encode() + b' 0 R /Info ' + str(info).encode() + b' 0 R >>\nstartxref\n' + str(x).encode() + b'\n%%EOF\n'
dst = os.path.join(LAB, 'pdf', 'producers', 'loref--length-ref.pdf')
open(dst, 'wb').write(out)
print(dst)
