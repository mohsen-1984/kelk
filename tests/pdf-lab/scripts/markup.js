// Inline markup the Markdown lost: what the importer wrote as <strong>, <em>, <del> and inline <code> in its HTML
// that a CommonMark parser (marked, GFM) does not find in its Markdown again. Delimiters that do not flank their
// text by CommonMark's rules stay literal — Word's bold full stop after a plain word came out «بود**.**», the
// asterisks in the reader's text and no bold. A count, not a share: it should be 0 on every file.
//   const { markupLoss } = require('./markup.js'); markupLoss(html, markdown) → { lost, html, md }
const KELK = require('./env.js').KELK;
const marked = require(KELK + '/vendor/marked.umd.min_18.0.14.js');

const TAGS = { strong: /<(strong|b)>/g, em: /<(em|i)>/g, del: /<(del|s)>/g, code: /<code>/g };
const count = (html) => {
  const h = String(html || '').replace(/<pre[\s\S]*?<\/pre>/g, '');          // code blocks: their text is literal
  const o = {}; Object.keys(TAGS).forEach((k) => { o[k] = (h.match(TAGS[k]) || []).length; });
  return o;
};

function markupLoss(html, md) {
  const a = count(html), b = count(marked.parse(String(md || ''), { gfm: true }));
  let lost = 0; Object.keys(a).forEach((k) => { lost += Math.max(0, a[k] - b[k]); });
  return { lost, html: a, md: b };
}
module.exports = { markupLoss };
