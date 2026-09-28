/**
 * BidiView - direction for HTML shown in a browser (preview, standalone HTML)
 * ============================================================================
 * Version: 1.0
 * Author: mhn.com@gmail.com
 * License: MIT
 *
 * The browser already runs the Unicode BiDi Algorithm; BidiView applies the
 * decisions of BidiCore — the same ones the .doc / .docx / .pdf builders
 * apply — so a page shows what the files get:
 *   1. document direction   BidiCore.detectDirection
 *   2. block directions     BidiCore.planDirections (paragraphs, headings,
 *                           list items, quotes, table cells, LTR tables)
 *   3. isolates             BidiCore.findIsolateRanges over each block's own
 *                           text (BidiCore.flattenBlock) — one isolate per run,
 *                           even across <strong>/<em> boundaries
 * plus what only a browser page needs: list items indented by LEVEL on their
 * own start side (bd-b0 / bd-sN over --bd-base / --bd-step), as Word does, and
 * inline code as an isolate.
 *
 * Output is CLASSES only (bd-*), never a dir attribute, so the HTML handed to
 * other tools stays clean:
 *
 *   BidiView.apply(root, { dir: 'auto'|'rtl'|'ltr', endPunctuation: ['.'],
 *                          isolate: true, inlineCode: true }) → { dir, blocks, isolates }
 *   BidiView.clear(root)          remove everything apply() added
 *   BidiView.css()                the CSS the classes need
 *   BidiView.toAttributes(root)   classes → dir attributes (for the clipboard:
 *                                 Word reads dir, not CSS classes)
 *
 * Needs BidiCore (load it first). tools/bidi-lab.html carries both inline.
 */

(function (global) {
  'use strict';

  function core() {
    var B = global.BidiCore || (typeof require === 'function' ? require('./BidiCore.js') : null);
    if (!B) throw new Error('BidiView needs BidiCore (load lib/BidiCore.js first)');
    return B;
  }

  /** Direction an element ends up with: nearest planned ancestor, else the document. */
  function dirOf(el, root, map, doc) {
    for (var p = el; p && p !== root; p = p.parentNode) if (map.has(p)) return map.get(p);
    return doc;
  }

  /**
   * List indents by LEVEL on each item's own start side, as Word does: the text
   * of level n sits at base + (n−1) × step from that side, so an RTL item nested
   * in an LTR item is indented from the RIGHT as a level-2 item, although its
   * parent's indent was on the left. Each item's margin is what its same-side
   * ancestors have not given yet, as coefficients of base and step:
   * classes bd-b0 (no base: an ancestor on this side had it) and bd-sN.
   * CSS: --bd-base / --bd-step (default 1.7em).
   */
  function indent(root, map, doc) {
    var give = new Map();                       // li → { b, s } it adds on its side
    Array.prototype.forEach.call(root.querySelectorAll('li'), function (li) {
      var d = dirOf(li, root, map, doc), depth = 1, gb = 0, gs = 0;
      for (var a = li.parentElement ? li.parentElement.closest('li') : null; a && root.contains(a); a = a.parentElement ? a.parentElement.closest('li') : null) {
        depth++;
        if (dirOf(a, root, map, doc) === d) { var g = give.get(a) || { b: 0, s: 0 }; gb += g.b; gs += g.s; }
      }
      var mb = Math.max(0, 1 - gb), ms = Math.max(0, Math.min(9, (depth - 1) - gs));
      give.set(li, { b: mb, s: ms });
      if (!mb) li.classList.add('bd-b0');
      if (ms) li.classList.add('bd-s' + ms);
    });
  }

  function clear(root) {
    Array.prototype.slice.call(root.querySelectorAll('span.bd-iso-ltr, span.bd-iso-rtl')).forEach(function (s) {
      var parent = s.parentNode;                       // unwrap, keeping <strong>/<em> inside
      while (s.firstChild) parent.insertBefore(s.firstChild, s);
      parent.removeChild(s);
    });
    Array.prototype.slice.call(root.querySelectorAll('.bd-ltr, .bd-rtl, .bd-ltr-table, .bd-iso-ltr, .bd-iso-rtl, .bd-b0, [class*="bd-s"]')).forEach(function (el) {
      el.classList.remove('bd-ltr', 'bd-rtl', 'bd-ltr-table', 'bd-iso-ltr', 'bd-iso-rtl', 'bd-b0');
      for (var i = 1; i <= 9; i++) el.classList.remove('bd-s' + i);
      if (!el.classList.length) el.removeAttribute('class');          // leave the HTML as it was
    });
    root.classList.remove('bd-root', 'bd-doc-rtl', 'bd-doc-ltr');
    if (!root.classList.length) root.removeAttribute('class');
    root.normalize();
  }

  /** Classes → dir attributes and no classes (rich copy into Word, mail …). MUTATES root. */
  function toAttributes(root) {
    var all = [root].concat(Array.prototype.slice.call(root.querySelectorAll('.bd-ltr, .bd-rtl, .bd-ltr-table, .bd-iso-ltr, .bd-iso-rtl')));
    all.forEach(function (el) {
      var c = el.classList;
      if (c.contains('bd-doc-rtl') || c.contains('bd-rtl') || c.contains('bd-iso-rtl')) el.setAttribute('dir', 'rtl');
      else if (c.contains('bd-doc-ltr') || c.contains('bd-ltr') || c.contains('bd-ltr-table') || c.contains('bd-iso-ltr')) el.setAttribute('dir', 'ltr');
    });
    Array.prototype.slice.call(root.querySelectorAll('span.bd-iso-ltr, span.bd-iso-rtl')).forEach(function (s) {
      s.classList.remove('bd-iso-ltr', 'bd-iso-rtl');
      if (!s.className) s.removeAttribute('class');
    });
    clear(root);
    Array.prototype.slice.call(root.querySelectorAll('[class=""]')).forEach(function (el) { el.removeAttribute('class'); });
    return root;
  }

  /** An inline element emptied by extractContents() (its text moved into the isolate). */
  function dropEmpty(n) {
    if (n && n.nodeType === 1 && /^(STRONG|EM|B|I|U|S|DEL|INS|MARK|SMALL|SUB|SUP|SPAN)$/.test(n.tagName) &&
        !n.textContent && !n.querySelector('img, br, input')) n.parentNode.removeChild(n);
  }

  /** Counter-direction runs of every block: BidiCore ranges → span.bd-iso-*. */
  function isolate(root, map, doc, o) {
    var B = core(), count = 0;
    Array.prototype.forEach.call(root.querySelectorAll(B.BLOCK_SEL), function (el) {
      if (el.closest('pre')) return;
      var flat = B.flattenBlock(el);
      if (!B.hasMix(flat.text)) return;
      var base = dirOf(el, root, map, doc), other = base === 'rtl' ? 'ltr' : 'rtl';
      var ranges = B.findIsolateRanges(flat.text, base, { endPunctuation: o.endPunctuation });
      // last range first: earlier ranges and the node map stay valid;
      // extractContents() splits a partly covered <strong>/<em> correctly
      for (var r = ranges.length - 1; r >= 0; r--) {
        var a = ranges[r][0], b = ranges[r][1];
        if (b <= a) continue;
        var sp = B.resolvePosition(flat.nodeMap, a), ep = B.resolvePosition(flat.nodeMap, b);
        var range = document.createRange();
        range.setStart(sp.node, sp.offset);
        range.setEnd(ep.node, ep.offset);
        var span = document.createElement('span');
        span.className = 'bd-iso-' + other;
        span.appendChild(range.extractContents());
        range.insertNode(span);
        dropEmpty(span.previousSibling); dropEmpty(span.nextSibling);   // shells left by the split
        count++;
      }
    });
    return count;
  }

  function apply(root, options) {
    var o = Object.assign({ dir: 'auto', endPunctuation: ['.'], isolate: true, inlineCode: true }, options || {});
    var B = core();
    clear(root);
    var doc = o.dir === 'rtl' || o.dir === 'ltr' ? o.dir : B.detectDirection(root);
    root.classList.add('bd-root', 'bd-doc-' + doc);
    var plan = B.planToMaps(B.planDirections(root, doc === 'rtl'));
    plan.dir.forEach(function (d, el) { el.classList.add('bd-' + d); });
    plan.ltrTables.forEach(function (t) { t.classList.add('bd-ltr-table'); });
    indent(root, plan.dir, doc);
    if (o.inlineCode) {
      Array.prototype.forEach.call(root.querySelectorAll('code'), function (c) {
        if (c.closest('pre')) return;
        c.classList.add('bd-iso-' + (B.firstStrong(c.textContent) || 'ltr'));
      });
    }
    var runs = o.isolate ? isolate(root, plan.dir, doc, o) : 0;
    return { dir: doc, blocks: plan.dir.size, isolates: runs };
  }

  /** The CSS the classes need. Lists: the marker and indent follow each item. */
  function css() {
    return [
      '.bd-doc-rtl{direction:rtl}.bd-doc-ltr{direction:ltr}',
      '.bd-ltr,.bd-ltr-table{direction:ltr}.bd-rtl{direction:rtl}',
      '.bd-root :is(p,h1,h2,h3,h4,h5,h6,li,blockquote,ul,ol,dt,dd):is(.bd-ltr,.bd-rtl){text-align:start}',
      '.bd-root :is(td,th):is(.bd-ltr,.bd-rtl):not([align]):not([style*="text-align"]){text-align:start}',
      '.bd-iso-ltr{unicode-bidi:isolate;direction:ltr}.bd-iso-rtl{unicode-bidi:isolate;direction:rtl}',
      '.bd-root pre{direction:ltr;text-align:left}',
      '.bd-root :is(ul,ol){padding-inline-start:0}',
      '.bd-root li{--bd-b:1;--bd-s:0;margin-inline-start:calc(var(--bd-b) * var(--bd-base,1.7em) + var(--bd-s) * var(--bd-step,1.7em))}',
      '.bd-root li.bd-b0{--bd-b:0}' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (n) { return '.bd-root li.bd-s' + n + '{--bd-s:' + n + '}'; }).join('')
    ].join('\n');
  }

  var BidiView = { version: '1.0', apply: apply, clear: clear, css: css, toAttributes: toAttributes };

  if (typeof module !== 'undefined' && module.exports) module.exports = BidiView;
  else if (typeof define === 'function' && define.amd) define([], function () { return BidiView; });
  else global.BidiView = BidiView;
})(typeof window !== 'undefined' ? window : this);
