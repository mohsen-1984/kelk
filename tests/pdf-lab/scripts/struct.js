// The structure trees of tagged PDFs, audited: what a producer wrote, and how much of the text it reaches.
//   node scripts/struct.js [dir|file …] [--tree N]     default: pdf/ (and fuzz/dev when made)
// Per file, from pdf.js (getStructTree and the marked content of getTextContent — what the importer can see):
//   tags      the roles in the tree (RoleMap applied by pdf.js), headings with their levels
//   cover     the share of the page text (artifacts aside) inside marked content the tree points to
//   sem       the share of that text whose nearest tagged ancestor says something layout cannot see for
//             sure: H1–H6, list (L/LI/Lbl/LBody), table (Table/TR/TH/TD), Code, BlockQuote, Caption, TOC …
//             — against the generic ones (P, Span, Div, NonStruct, Part, Sect, Document)
//   art       the share of all text marked as /Artifact (running heads, page numbers, decoration)
// A tree with sem near 0 is no help however complete it is (LibreOffice Calc: one P per sheet);
// one with cover near 0 does not reach the text. Both feed the trust weight of step 6.
// --tree N prints the first N lines of each file's tree (page 1).
const fs = require('fs'), path = require('path');
const { LAB, FUZZ, lab, req } = require('./env.js');

const SEM = /^(H[1-6]?|Title|L|LI|Lbl|LBody|Table|TR|TH|TD|THead|TBody|TFoot|Code|BlockQuote|Quote|Caption|TOC|TOCI|Note|Reference|BibEntry|Formula|Figure|Link)$/;
const args = process.argv.slice(2), treeN = args.includes('--tree') ? +args[args.indexOf('--tree') + 1] || 30 : 0;
const targets = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--tree');
const files = [];
(targets.length ? targets : [path.join(LAB, 'pdf')].concat(fs.existsSync(path.join(FUZZ, 'dev')) ? [path.join(FUZZ, 'dev')] : []))
  .forEach((t) => { if (fs.statSync(t).isDirectory()) require('./env.js').labPdfs(t).forEach((x) => files.push(x.file)); else files.push(t); });

(async () => {
  const { chromium } = req('playwright');
  const browser = await chromium.launch(), page = await browser.newPage();
  await page.goto(lab);
  const rows = [];
  for (const f of files) {
    const b64 = fs.readFileSync(f).toString('base64');
    const r = await page.evaluate(async ({ b64, treeN, SEMsrc }) => {
      const SEM = new RegExp(SEMsrc);
      const bin = atob(b64), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const task = pdfjsLib.getDocument({ data: u, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }), doc = await task.promise;
      const out = { pages: doc.numPages, tagged: false, roles: {}, heads: {}, chars: 0, covered: 0, sem: 0, art: 0, tree: [] };
      for (let n = 1; n <= Math.min(doc.numPages, 30); n++) {
        const pg = await doc.getPage(n);
        let tree = null; try { tree = await pg.getStructTree(); } catch (e) { tree = null; }
        const owner = {};       // marked-content id → nearest semantic role (or 'generic')
        if (tree && tree.children && tree.children.length) {
          out.tagged = true;
          const walk = (node, sem, depth) => {
            if (node.type === 'content' || node.type === 'object' || node.type === 'annotation') { if (node.id) owner[node.id] = sem || 'generic'; return; }
            const role = node.role || '';
            if (role) { out.roles[role] = (out.roles[role] || 0) + 1; const h = role.match(/^H([1-6])$/); if (h) out.heads[h[1]] = (out.heads[h[1]] || 0) + 1; }
            if (n === 1 && treeN && out.tree.length < treeN && role) out.tree.push('  '.repeat(depth) + role + (node.alt ? ' alt="' + node.alt + '"' : ''));
            (node.children || []).forEach((c) => walk(c, SEM.test(role) ? role : sem, depth + 1));
          };
          walk(tree, null, 0);
        }
        const tc = await pg.getTextContent({ includeMarkedContent: true });
        const stack = [];
        tc.items.forEach((it) => {
          if (it.type === 'beginMarkedContent' || it.type === 'beginMarkedContentProps') { stack.push({ id: it.id || null, tag: it.tag || '' }); return; }
          if (it.type === 'endMarkedContent') { stack.pop(); return; }
          const k = String(it.str || '').replace(/\s+/g, '').length; if (!k) return;
          if (stack.some((s) => s.tag === 'Artifact')) { out.art += k; return; }
          out.chars += k;
          const id = stack.slice().reverse().map((s) => s.id).find((x) => x && x in owner);
          if (id) { out.covered += k; if (owner[id] !== 'generic') out.sem += k; }
        });
        pg.cleanup();
      }
      await task.destroy();
      return out;
    }, { b64, treeN, SEMsrc: SEM.source });
    rows.push(Object.assign({ name: path.basename(f) }, r));
  }
  await browser.close();

  const pct = (a, b) => b ? (100 * a / b).toFixed(0).padStart(4) : '   -';
  console.log('file'.padEnd(40), 'tagged cover  sem  art  headings  roles');
  rows.forEach((r) => {
    const roles = Object.keys(r.roles).filter((k) => !/^(Root|Document|Part|Sect|Div|NonStruct|Span|P|Art|H[1-6])$/.test(k)).sort().join(' ');
    const heads = Object.keys(r.heads).sort().map((k) => 'H' + k + '×' + r.heads[k]).join(' ');
    console.log(r.name.slice(0, 40).padEnd(40), (r.tagged ? 'yes' : 'no').padEnd(6), pct(r.covered, r.chars), pct(r.sem, r.chars),
      pct(r.art, r.art + r.chars), ' ', (heads || '-').padEnd(9), roles || '-');
    if (treeN && r.tree.length) console.log(r.tree.map((l) => '    ' + l).join('\n'));
  });
  // per producer (the file-name prefix)
  const by = {};
  rows.forEach((r) => { const k = r.name.replace(/--.*$/, '').replace(/^fz\d+-/, 'fuzz-'); (by[k] = by[k] || []).push(r); });
  console.log('\nper producer'.padEnd(41), 'files tagged cover  sem');
  Object.keys(by).sort().forEach((k) => {
    const rs = by[k], t = rs.filter((r) => r.tagged), ch = t.reduce((s, r) => s + r.chars, 0);
    console.log(('  ' + k).padEnd(40), String(rs.length).padStart(5), String(t.length).padStart(6), pct(t.reduce((s, r) => s + r.covered, 0), ch), pct(t.reduce((s, r) => s + r.sem, 0), ch));
  });
  fs.writeFileSync(path.join(require('./env.js').OUT, '_struct.json'), JSON.stringify(rows, null, 1));
})();
