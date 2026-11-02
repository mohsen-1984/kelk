/**
 * PdfBuilder's Arabic-script shaping (lib/PdfBuilder.js, PdfBuilder._shaping): the presentation-form table
 * against Unicode, U+0649 in its four positions, and the joining letters that have no presentation form
 * (plan P1.3, bug B1). Code points are written as numbers: the file stays readable without RTL text.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PdfBuilder } = require('../../lib/PdfBuilder.js');

const { shapeArabic, joiningType, forms } = PdfBuilder._shaping;

/** code points → string */
const s = function () {
  return String.fromCharCode.apply(null, arguments);
};
/** string → 'XXXX XXXX …' (readable assertion messages) */
const hex = function (t) {
  return Array.from(t)
    .map(function (c) {
      return c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0');
    })
    .join(' ');
};
const shaped = function (cps) {
  return hex(shapeArabic(s.apply(null, cps)));
};

const BEH = 0x0628,
  ALEF = 0x0627,
  KASRA = 0x0650,
  ZWNJ = 0x200c,
  TATWEEL = 0x0640;

test('U+0649 alef maksura: isolated FEEF, final FEF0, initial FBE8, medial FBE9 (B1: was U+0488 / U+0489)', function () {
  assert.equal(shaped([0x0649]), 'FEEF');
  assert.equal(shaped([BEH, 0x0649]), 'FE91 FEF0');
  assert.equal(shaped([0x0649, BEH]), 'FBE8 FE90');
  assert.equal(shaped([BEH, 0x0649, BEH]), 'FE91 FBE9 FE90');
  assert.equal(shaped([TATWEEL, 0x0649, TATWEEL]), '0640 FBE9 0640');
  assert.equal(shaped([0x0649, KASRA, BEH]), 'FBE8 0650 FE90', 'a haraka between is transparent');
  assert.equal(shaped([0x0649, ZWNJ, BEH]), 'FEEF 200C FE8F', 'ZWNJ breaks the join');
});

test('every form in the table is a presentation form of its letter (NFKC), in the presentation-form blocks', function () {
  Object.keys(forms).forEach(function (k) {
    const base = s(+k);
    forms[k].forEach(function (cp, i) {
      assert.ok(
        (cp >= 0xfb50 && cp <= 0xfdff) || (cp >= 0xfe70 && cp <= 0xfeff),
        hex(base) + ' form ' + i + ': ' + hex(s(cp))
      );
      // FBDD is the isolated form of U+0677, whose own NFKC is U+06C7 U+0674
      assert.equal(s(cp).normalize('NFKC'), base.normalize('NFKC'), hex(base) + ' form ' + i + ': ' + hex(s(cp)));
    });
  });
});

test('the table holds every presentation form Unicode defines for a letter of U+0620-077F', function () {
  const unicode = {};
  for (let c = 0xfb50; c <= 0xfeff; c++) {
    const n = s(c).normalize('NFKC');
    if (n.length === 1 && n.charCodeAt(0) >= 0x0620 && n.charCodeAt(0) <= 0x077f)
      (unicode[n.charCodeAt(0)] = unicode[n.charCodeAt(0)] || []).push(c);
  }
  Object.keys(unicode).forEach(function (k) {
    const have = (forms[k] || []).slice().sort(function (a, b) {
      return a - b;
    });
    assert.deepEqual(have, unicode[k], hex(s(+k)));
  });
});

test('joining types follow ArabicShaping.txt, presentation forms or not', function () {
  const D = [
    0x0620, 0x0626, 0x0628, 0x063b, 0x063c, 0x063d, 0x063e, 0x063f, 0x0649, 0x064a, 0x066e, 0x066f, 0x06b5, 0x06c2,
    0x06cc, 0x06fa, 0x06fb, 0x06fc, 0x06ff, 0x0750, 0x077f
  ];
  const R = [0x0622, 0x0627, 0x0629, 0x0648, 0x0677, 0x06c0, 0x06c3, 0x06c4, 0x06d5, 0x06ee, 0x06ef, 0x0759, 0x0779];
  const U = [0x0621, 0x0674, 0x06dd, 0x060c, 0x061f, 0x0660, 0x06f0, ZWNJ, 0x0041];
  D.forEach(function (c) {
    assert.equal(joiningType(s(c)), 'D', hex(s(c)));
  });
  R.forEach(function (c) {
    assert.equal(joiningType(s(c)), 'R', hex(s(c)));
  });
  U.forEach(function (c) {
    assert.equal(joiningType(s(c)), 'U', hex(s(c)));
  });
  [KASRA, 0x0654, 0x0670, 0x06d6].forEach(function (c) {
    assert.equal(joiningType(s(c)), 'T', hex(s(c)));
  });
  [TATWEEL, 0x200d].forEach(function (c) {
    assert.equal(joiningType(s(c)), 'C', hex(s(c)));
  });
});

test('a dual-joining letter without presentation forms stays as it is, and its neighbours join it', function () {
  [0x0620, 0x063b, 0x063c, 0x063d, 0x063e, 0x063f, 0x066e, 0x066f, 0x06fa, 0x06fb, 0x06fc].forEach(function (c) {
    const x = hex(s(c));
    assert.equal(shaped([c]), x);
    assert.equal(shaped([BEH, c]), 'FE91 ' + x, x + ' final: beh before it joins forward');
    assert.equal(shaped([c, BEH]), x + ' FE90', x + ' initial: beh after it joins back');
    assert.equal(shaped([BEH, c, BEH]), 'FE91 ' + x + ' FE90', x + ' medial');
    assert.equal(shaped([c, ALEF]), x + ' FE8E', x + ' before alef');
  });
});

test('U+06D5 (right-joining, no presentation forms) joins the letter before it, not the one after', function () {
  assert.equal(shaped([0x06d5]), '06D5');
  assert.equal(shaped([BEH, 0x06d5]), 'FE91 06D5');
  assert.equal(shaped([0x06d5, BEH]), '06D5 FE8F');
  assert.equal(shaped([BEH, 0x06d5, BEH]), 'FE91 06D5 FE8F');
});

test('a letter with only some forms joins only on the sides they draw (U+06BA as R, U+0677 as U)', function () {
  // noon ghunna: dual-joining in Unicode, but only isolated FB9E and final FB9F exist
  assert.equal(joiningType(s(0x06ba)), 'D');
  assert.equal(shaped([0x06ba]), 'FB9E');
  assert.equal(shaped([BEH, 0x06ba]), 'FE91 FB9F');
  assert.equal(shaped([0x06ba, BEH]), 'FB9E FE8F', 'no initial form: the beh after it stays unjoined');
  assert.equal(shaped([BEH, 0x06ba, BEH]), 'FE91 FB9F FE8F', 'no medial form: final, then an isolated beh');
  // U+0677: right-joining, an isolated form only (jsPDF draws the letter as FBDD)
  assert.equal(joiningType(s(0x0677)), 'R');
  assert.equal(shaped([BEH, 0x0677]), 'FE8F 0677', 'the beh before it does not join into an isolated-only glyph');
  // every letter of the table, in every position: the form asked for exists, and a neighbour that joins
  // towards it is answered by a joining form (a medial / initial beh only next to a final / medial / initial form)
  Object.keys(forms).forEach(function (k) {
    const f = forms[k];
    [[+k], [BEH, +k], [+k, BEH], [BEH, +k, BEH]].forEach(function (cps) {
      const out = Array.from(shapeArabic(s.apply(null, cps))).map(function (c) {
        return c.charCodeAt(0);
      });
      const at = cps.indexOf(+k),
        me = out[at];
      assert.ok(f.indexOf(me) >= 0 || me === +k, hex(s.apply(null, cps)) + ' → ' + hex(s.apply(null, out)));
      if (at > 0 && out[at - 1] === 0xfe91)
        assert.notEqual(f.indexOf(me) % 2, 0, hex(s.apply(null, cps)) + ': beh joins, the letter does not');
    });
  });
});

test('text without Arabic letters is returned unchanged', function () {
  ['', 'abc', s(0x05d0, 0x05d1), s(0x06f1, 0x06f2), s(0x060c)].forEach(function (t) {
    assert.equal(shapeArabic(t), t);
  });
});
