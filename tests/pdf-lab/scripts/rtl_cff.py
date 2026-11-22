# The lab's small CFF writer (moved out of make-cff33.py for Kelk 3.5's make-decipher35.py, unchanged): a TrueType
# face's used glyphs written as a bare CFF program — plain (/Type1C, one-byte codes) or CID-keyed (/CIDFontType0C) —,
# and Doc3, pages of glyphs in such faces. Fonts are saved with fixed values, so a regenerated lab file is the same.
import io, os, zlib, random
from fontTools.ttLib import TTFont
from fontTools.cffLib import cffStandardStrings
from fontTools.misc.psCharStrings import T2CharString
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.transformPen import TransformPen
from rtl_pdf import LAB, visual
from rtl_pdf2 import brackets

# ---- a small CFF writer ------------------------------------------------------------------------------------------------
STD = {s: i for i, s in enumerate(cffStandardStrings)}
def dint(v): return bytes([29]) + int(v).to_bytes(4, 'big', signed=True)       # five bytes, so offsets can be filled late
def dreal(v):
    nib = []
    for ch in ('%.12g' % v).replace('e-', 'c').replace('e+', 'b'):
        nib.append(int(ch) if ch.isdigit() else {'.': 0xa, 'b': 0xb, 'c': 0xc, '-': 0xe}[ch])
    nib.append(0xf)
    if len(nib) % 2: nib.append(0xf)
    return bytes([30]) + bytes(nib[i] << 4 | nib[i + 1] for i in range(0, len(nib), 2))
def esc(n): return bytes([12, n])
def index(items):
    if not items: return b'\0\0'
    offs, o = [1], 1
    for it in items: o += len(it); offs.append(o)
    size = 1 if o < 0x100 else 2 if o < 0x10000 else 3
    return len(items).to_bytes(2, 'big') + bytes([size]) + b''.join(x.to_bytes(size, 'big') for x in offs) + b''.join(items)
def bias(n): return 107 if n < 1240 else 1131 if n < 33900 else 32768
def compiled(prog): c = T2CharString(program=prog); c.compile(); return c.bytecode
MOVES = ('rmoveto', 'hmoveto', 'vmoveto')

def cff_program(name, glyphs, cids=None, codes=None, units=1000, subrs=False, bbox=(0, -300, 1000, 900)):
    """glyphs: [(glyph name, T2 path program without width or endchar, width)], .notdef first. cids: a CID per glyph (a
    CID-keyed font), else a plain font whose built-in encoding gives codes[i] to glyph i (past .notdef). units: units
    an em (FontMatrix 1/units). subrs: each outline drawn by a local subroutine, which calls a global one for the
    outline's later contours"""
    gsub, lsub, chars = [], [], []
    for gname, path, width in glyphs:
        if subrs and path:
            moves = [i for i, t in enumerate(path) if t in MOVES]
            first, rest = path, []
            if len(moves) > 1:                       # cut where the second contour's moveto operands start
                j = moves[1] - 1
                while j >= 0 and not isinstance(path[j], str): j -= 1
                first, rest = path[:j + 1], path[j + 1:]
            if rest:
                gsub.append(rest + ['return']); first = first + [('G', len(gsub) - 1), 'callgsubr']
            lsub.append(first + ['return'])
            chars.append([width, ('L', len(lsub) - 1), 'callsubr', 'endchar'])
        else:
            chars.append([width] + list(path) + ['endchar'])
    gb, lb = bias(len(gsub)), bias(len(lsub))
    fix = lambda p: [(t[1] - (gb if t[0] == 'G' else lb)) if isinstance(t, tuple) else t for t in p]
    gsub_b, lsub_b, char_b = [compiled(fix(p)) for p in gsub], [compiled(fix(p)) for p in lsub], [compiled(fix(p)) for p in chars]
    strings = []
    def sid(s):
        if s in STD: return STD[s]
        if s not in strings: strings.append(s)
        return 391 + strings.index(s)
    if cids is not None:
        ros = (sid('Adobe'), sid('Identity'))
        charset = bytes([0]) + b''.join(c.to_bytes(2, 'big') for c in cids[1:])
        extra = bytes([3]) + (1).to_bytes(2, 'big') + (0).to_bytes(2, 'big') + bytes([0]) + len(glyphs).to_bytes(2, 'big')
    else:
        charset = bytes([0]) + b''.join(sid(g[0]).to_bytes(2, 'big') for g in glyphs[1:])
        extra = bytes([0, len(codes)]) + bytes(codes)                       # Encoding format 0
    private = (dint(6) + bytes([19])) if lsub else (dint(0) + bytes([20]))  # Subrs right after it, or defaultWidthX 0
    fm = (dreal(1.0 / units) + dint(0) + dint(0) + dreal(1.0 / units) + dint(0) + dint(0) + esc(7)) if units != 1000 else b''
    box = b''.join(dint(round(v * units / 1000)) for v in bbox) + bytes([5])
    def top(o):
        if cids is not None:
            return (dint(ros[0]) + dint(ros[1]) + dint(0) + esc(30) + dint(max(cids) + 1) + esc(34) + box + fm +
                    dint(o['charset']) + bytes([15]) + dint(o['extra']) + esc(37) + dint(o['fdarray']) + esc(36) +
                    dint(o['chars']) + bytes([17]))
        return (box + fm + dint(o['charset']) + bytes([15]) + dint(o['extra']) + bytes([16]) + dint(o['chars']) + bytes([17]) +
                dint(len(private)) + dint(o['private']) + bytes([18]))
    fd = lambda o: dint(len(private)) + dint(o['private']) + bytes([18])
    zero = dict.fromkeys(('charset', 'extra', 'fdarray', 'chars', 'private'), 0)
    head = bytes([1, 0, 4, 4]) + index([name.encode()])
    top_len = len(index([top(zero)]))
    strings_idx, gsub_idx = index([s.encode() for s in strings]), index(gsub_b)
    o = {}; pos = len(head) + top_len + len(strings_idx) + len(gsub_idx)
    o['charset'] = pos; pos += len(charset)
    o['extra'] = pos; pos += len(extra)
    chars_idx = index(char_b); o['chars'] = pos; pos += len(chars_idx)
    if cids is not None:
        fd_len = len(index([fd(zero)])); o['fdarray'] = pos; pos += fd_len
    o['private'] = pos
    body = head + index([top(o)]) + strings_idx + gsub_idx + charset + extra + chars_idx
    if cids is not None: body += index([fd(o)])
    assert len(body) == o['private']
    return body + private + (index(lsub_b) if lsub else b'')

def bars(gid, adv, units):
    """a glyph drawn as one to three bars made from its glyph id (make-unknown32.py's abstract glyphs): shapes no font has"""
    h = (gid * 2654435761) & 0xFFFFFFFF; prog = []; x = y = 0
    for k in range(1 + h % 3):
        b = (h >> (5 * k)) & 31
        x0 = round(adv * (0.1 + 0.25 * (b % 3))); x1 = x0 + round(adv * 0.18) + 10
        y0 = round(units * (-0.1 + 0.15 * (b % 4))); y1 = y0 + round(units * (0.2 + 0.1 * (b % 5)))
        prog += [x0 - x, y0 - y, 'rmoveto', y1 - y0, x1 - x0, y0 - y1, 'vlineto']; x, y = x1, y0
    return prog

# ---- a face drawn through a CFF program ----------------------------------------------------------------------------------
class CffFace:
    """a source TrueType face whose used glyphs become a CFF program. kind: 'cid' (codes = the source's glyph ids, as
    CIDs) or 'plain' (one-byte codes). coding (plain): 'renum' (33… in order of first use, the space 32), 'ascii' (the
    character's own code) or 'shuffle' (1… shuffled, after prepare()). names: 'std' (the source's standard glyph names)
    or 'none' (names that say nothing). tounicode: write a /ToUnicode of the names drawn (base letters)."""
    def __init__(self, src, ps, kind='plain', coding='renum', names='none', units=None, subrs=False, tounicode=False, seed=1, bars=False):
        self.t = TTFont(src); self.cmap = self.t.getBestCmap(); self.gs = self.t.getGlyphSet(); self.upem = self.t['head'].unitsPerEm
        self.ps, self.kind, self.coding, self.names, self.subrs, self.tu = ps, kind, coding, names, subrs, tounicode
        self.units = units or self.upem; self.used, self.code, self.text, self.seed, self.bars = [], {}, {}, seed, bars
    def adv(self, c, size): return self.t['hmtx'][self.cmap[c]][0] * size / self.upem
    def _use(self, g):
        if g in self.code: return
        self.used.append(g)
        if self.kind == 'cid': self.code[g] = self.t.getGlyphID(g)
        elif self.coding == 'renum':
            self.code[g] = 32 if g == self.cmap.get(0x20) else 33 + sum(1 for v in self.code.values() if v != 32)
        elif self.coding == 'ascii': self.code[g] = next(u for u, n in self.cmap.items() if n == g and u < 0x80)
        else: self.code[g] = None
        assert self.kind == 'cid' or self.code[g] is None or self.code[g] < 256
    def prepare(self, lines):
        """shuffle coding: every glyph the lines draw, then codes 1… in a shuffled order"""
        for t in lines:
            for c, _ in brackets(visual(t)): self._use(self.cmap[c])
        self._use(self.cmap[0x20])
        ks = list(range(1, len(self.used) + 1)); random.Random(self.seed).shuffle(ks)
        self.code = dict(zip(self.used, ks))
    def put(self, c, n):
        g = self.cmap[c]; self._use(g); k = self.code[g]
        self.text.setdefault(k, n)
        return ('%04X' if self.kind == 'cid' else '%02X') % k
    def w1000(self, g): return round(self.t['hmtx'][g][0] * 1000 / self.upem)
    def program(self):
        s = self.units / self.upem; glyphs = []
        for i, g in enumerate(['.notdef'] + self.used):
            pen = T2CharStringPen(None, self.gs); self.gs[g].draw(TransformPen(pen, (s, 0, 0, s, 0, 0)))
            path = [t for t in pen.getCharString().program if t != 'endchar']
            if self.bars and path: path = bars(self.t.getGlyphID(g), round(self.t['hmtx'][g][0] * s), self.units)
            nm = g if self.names == 'std' and g in STD else '.notdef' if i == 0 else 'x%d' % (100 + i)
            glyphs.append((nm, path, round(self.t['hmtx'][g][0] * s)))
        if self.kind == 'cid':
            return cff_program(self.ps.split('+')[-1], glyphs, cids=[0] + [self.code[g] for g in self.used], units=self.units)
        return cff_program(self.ps.split('+')[-1], glyphs, codes=[self.code[g] for g in self.used], units=self.units, subrs=self.subrs)
    def pdf(self, obj, stream):
        prog = self.program()
        sub = 'CIDFontType0C' if self.kind == 'cid' else 'Type1C'
        ff = obj(stream(prog, '/Subtype /%s' % sub))
        desc = obj('<< /Type /FontDescriptor /FontName /%s /Flags %d /FontBBox [-300 -500 1200 1000] /ItalicAngle 0 /Ascent 900 /Descent -300 /CapHeight 700 /StemV 80 /FontFile3 %d 0 R >>'
                   % (self.ps, 4 if self.kind == 'cid' else 32 if self.names == 'std' else 4, ff))
        u16 = lambda t: ''.join('%04X' % ord(x) for x in t)
        if self.kind == 'cid':
            w = ' '.join('%d [%d]' % (self.code[g], self.w1000(g)) for g in sorted(self.used, key=lambda g: self.code[g]))
            cid = obj('<< /Type /Font /Subtype /CIDFontType0 /BaseFont /%s /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor %d 0 R /DW 1000 /W [%s] >>' % (self.ps, desc, w))
            return obj('<< /Type /Font /Subtype /Type0 /BaseFont /%s-Identity-H /Encoding /Identity-H /DescendantFonts [%d 0 R] >>' % (self.ps.split('+')[-1], cid))
        by = {k: g for g, k in self.code.items()}; first, last = min(by), max(by)
        tu = ''
        if self.tu:
            cm = ('/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CMapName /%s def /CMapType 2 def 1 begincodespacerange <00> <FF> endcodespacerange\n'
                  '%d beginbfchar\n%s\nendbfchar\nendcmap CMapName currentdict /CMap defineresource pop end end') % (
                  self.ps.split('+')[-1], len(self.text), '\n'.join('<%02X> <%s>' % (k, u16(t)) for k, t in sorted(self.text.items())))
            tu = ' /ToUnicode %d 0 R' % obj(stream(cm.encode()))
        return obj('<< /Type /Font /Subtype /Type1 /BaseFont /%s /FirstChar %d /LastChar %d /Widths [%s] /FontDescriptor %d 0 R%s >>'
                   % (self.ps, first, last, ' '.join(str(self.w1000(by[k])) if k in by else '0' for k in range(first, last + 1)), desc, tu))

class Doc3:
    """pages of glyphs in CffFaces; pick(code) names the face a glyph is drawn in"""
    def __init__(self, faces, w=595.28, h=841.89, lang='fa-IR'):
        self.faces, self.w, self.h, self.lang, self.pages = faces, w, h, lang, {}
    def width(self, gl, size, pick): return sum(self.faces[pick(c)].adv(c, size) for c, _ in gl)
    def put(self, page, gl, x, y, size, pick, extra=0.0):
        for c, n in gl:
            f = pick(c); hx = self.faces[f].put(c, n)
            self.pages.setdefault(page, []).append('BT /%s %.2f Tf 1 0 0 1 %.3f %.3f Tm <%s> Tj ET' % (f, size, x, y, hx))
            x += self.faces[f].adv(c, size) + (extra if c == 0x20 else 0)
    def line(self, page, text, y, size, right, pick, justify=None, center=None):
        gl = brackets(visual(text)); w = self.width(gl, size, pick); n = sum(1 for c, _ in gl if c == 0x20)
        extra = (justify - w) / n if justify and n else 0
        assert extra >= 0, ('line too long for its measure', text)
        x0 = center - w / 2 if center is not None else right - w - extra * n
        self.put(page, gl, x0, y, size, pick, extra)
    def para(self, page, text, y, size, right, measure, pick, lead=1.7):
        ls, cur = [], ''
        for wd in text.split(' '):
            t = (cur + ' ' + wd).strip()
            if cur and self.width(brackets(visual(t)), size, pick) > measure: ls.append(cur); cur = wd
            else: cur = t
        ls.append(cur)
        for k, l in enumerate(ls):
            self.line(page, l, y, size, right, pick, justify=measure if k < len(ls) - 1 else None); y -= size * lead
        return y
    def write(self, path, producer, title):
        objs = []
        def obj(b): objs.append(b if isinstance(b, bytes) else b.encode()); return len(objs)
        def stream(data, extra=''):
            z = zlib.compress(data)
            return b'<< /Length %d /Filter /FlateDecode %s >>\nstream\n' % (len(z), extra.encode()) + z + b'\nendstream'
        ref = {k: F.pdf(obj, stream) for k, F in self.faces.items() if F.used}
        res = ' '.join('/%s %d 0 R' % kv for kv in ref.items())
        np = max(self.pages); pages_id = len(objs) + 2 * np + 1; kids = []
        for p in range(1, np + 1):
            c = obj(stream('\n'.join(self.pages.get(p, [])).encode()))
            kids.append(obj('<< /Type /Page /Parent %d 0 R /MediaBox [0 0 %g %g] /Resources << /Font << %s >> >> /Contents %d 0 R >>' % (pages_id, self.w, self.h, res, c)))
        assert obj('<< /Type /Pages /Kids [%s] /Count %d >>' % (' '.join('%d 0 R' % k for k in kids), np)) == pages_id
        cat = obj('<< /Type /Catalog /Pages %d 0 R /Lang (%s) >>' % (pages_id, self.lang))
        info = obj(b'<< /Producer (' + producer + b') /Creator (' + producer + b') /Title (' + title.encode() + b') >>')
        buf = io.BytesIO(); buf.write(b'%PDF-1.6\n%\xe2\xe3\xcf\xd3\n'); offs = []
        for i, b in enumerate(objs): offs.append(buf.tell()); buf.write(b'%d 0 obj\n' % (i + 1) + b + b'\nendobj\n')
        x = buf.tell()
        buf.write(b'xref\n0 %d\n0000000000 65535 f \n' % (len(objs) + 1) + b''.join(b'%010d 00000 n \n' % o for o in offs))
        buf.write(b'trailer\n<< /Size %d /Root %d 0 R /Info %d 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (len(objs) + 1, cat, info, x))
        open(path, 'wb').write(buf.getvalue()); print(os.path.relpath(path, LAB), len(buf.getvalue()), 'bytes')
