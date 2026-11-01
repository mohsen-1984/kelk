// Two Word samples for PDF printers: corpus/word-tables.docx and corpus/word-rich.docx (+ the expected .md)
const fs = require('fs'), path = require('path');
const d = require('./env.js').req('docx');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType,
  Header, Footer, PageNumber, FootnoteReferenceRun, EndnoteReferenceRun, ExternalHyperlink, LevelFormat, ShadingType } = d;
const OUT = path.join(__dirname, '..', 'corpus');

const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const LINE = { style: BorderStyle.SINGLE, size: 6, color: '444444' };
const cell = (text, opts = {}) => new TableCell({
  width: { size: opts.w || 2000, type: WidthType.DXA },
  borders: opts.borders, shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill, color: 'auto' } : undefined,
  children: [new Paragraph({ alignment: opts.right ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text, bold: !!opts.bold })] })]
});
const table = (rows, kind, widths) => new Table({
  width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA }, columnWidths: widths,
  borders: kind === 'grid' ? { top: LINE, bottom: LINE, left: LINE, right: LINE, insideHorizontal: LINE, insideVertical: LINE }
                           : { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE },
  rows: rows.map((r, i) => new TableRow({ tableHeader: i === 0, children: r.map((t, k) => cell(t, { w: widths[k], bold: i === 0, right: /^[\d$,.%-]+$/.test(t) && i > 0, fill: i === 0 && kind === 'grid' ? 'D9E2F3' : undefined })) }))
});
const md = (rows) => ['| ' + rows[0].join(' | ') + ' |', '|' + rows[0].map(() => '---').join('|') + '|'].concat(rows.slice(1).map((r) => '| ' + r.join(' | ') + ' |')).join('\n');
const P = (text) => new Paragraph({ children: [new TextRun(text)] });
const numbering = { config: [
  { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
                                    { level: 1, format: LevelFormat.BULLET, text: 'o', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1440, hanging: 360 } }, run: { font: 'Courier New' } } }] },
  { reference: 'steps', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }] };

// ── 1. tables and mixed text ──
const budget = [['Item', 'Quarter', 'Planned', 'Actual', 'Variance'], ['Laptops', 'Q1', '$42,000', '$39,500', '-6.0%'], ['Licenses', 'Q1', '$18,250', '$19,100', '4.7%'],
  ['Training', 'Q2', '$7,800', '$6,900', '-11.5%'], ['Cloud hosting', 'Q2', '$24,600', '$26,300', '6.9%'], ['Total', '', '$92,650', '$91,800', '-0.9%']];
const contacts = [['Team', 'Lead', 'Room', 'Extension'], ['Infrastructure', 'Nora Patel', 'B-214', '4412'], ['Applications', 'Omar Haddad', 'B-118', '4387'],
  ['Security', 'Lena Fischer', 'C-302', '4520'], ['Service desk', 'Tom Becker', 'A-010', '4000']];
const doc1 = new Document({ numbering, styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } }, sections: [{ children: [
  new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun('Department Budget Review')] }),
  new Paragraph({ children: [new TextRun('This review compares the planned and actual spending of the '), new TextRun({ text: 'IT department', bold: true }),
    new TextRun(' for the first half of the year. Figures are in US dollars; a '), new TextRun({ text: 'negative variance', italics: true }), new TextRun(' means the team spent less than planned.')] }),
  new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('1. Spending by item')] }),
  P('The table below has a full grid of borders and a shaded header row.'),
  table(budget, 'grid', [2600, 1300, 1700, 1700, 1500]),
  P('Two items ran over budget:'),
  new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: 'Licenses', bold: true }), new TextRun(', because two products changed their pricing in March')] }),
  new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text: 'Cloud hosting', bold: true }), new TextRun(', because of the new reporting service')] }),
  new Paragraph({ numbering: { reference: 'bullets', level: 1 }, children: [new TextRun('the service went live four weeks early')] }),
  new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('2. Contacts')] }),
  P('The contact list is a table without any borders, as many people lay out a simple list of names.'),
  table(contacts, 'none', [2600, 2600, 1500, 1600]),
  new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('3. Next steps')] }),
  new Paragraph({ numbering: { reference: 'steps', level: 0 }, children: [new TextRun('Renegotiate the two license contracts before renewal.')] }),
  new Paragraph({ numbering: { reference: 'steps', level: 0 }, children: [new TextRun('Move the test environment to reserved instances.')] }),
  new Paragraph({ numbering: { reference: 'steps', level: 0 }, children: [new TextRun('Report again at the end of the third quarter.')] }),
] }] });
const md1 = `# Department Budget Review

This review compares the planned and actual spending of the **IT department** for the first half of the year. Figures are in US dollars; a *negative variance* means the team spent less than planned.

## 1. Spending by item

The table below has a full grid of borders and a shaded header row.

${md(budget)}

Two items ran over budget:

- **Licenses**, because two products changed their pricing in March
- **Cloud hosting**, because of the new reporting service
  - the service went live four weeks early

## 2. Contacts

The contact list is a table without any borders, as many people lay out a simple list of names.

${md(contacts)}

## 3. Next steps

1. Renegotiate the two license contracts before renewal.
2. Move the test environment to reserved instances.
3. Report again at the end of the third quarter.
`;

// ── 2. header / footer, footnotes, endnotes, highlight, a process diagram (added after) ──
const schedule = [['Phase', 'Start', 'End', 'Owner'], ['Discovery', 'March 2', 'March 20', 'Product team'], ['Pilot', 'April 6', 'May 15', 'Two branches'], ['Roll-out', 'June 1', 'July 31', 'All branches']];
const doc2 = new Document({
  styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
  footnotes: { 1: { children: [P('The survey ran from 10 to 24 January and had 412 answers.')] }, 2: { children: [P('Measured as the median time from request to first reply.')] } },
  endnotes: { 1: { children: [P('See the service catalogue, chapter 4, for the full list of request types.')] } },
  sections: [{
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Service Desk Renewal - internal', color: '666666', size: 18 })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES], size: 18 })] })] }) },
    children: [
      new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun('Service Desk Renewal Plan')] }),
      new Paragraph({ children: [new TextRun('Staff rated the current service desk as slow in a recent survey.'), new FootnoteReferenceRun(1),
        new TextRun(' The renewal aims to cut the '), new TextRun({ text: 'first-response time', highlight: 'yellow' }), new TextRun(' by half'), new FootnoteReferenceRun(2), new TextRun('.')] }),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('How a request flows')] }),
      new Paragraph({ children: [new TextRun('Every request goes through the same three stages. The '), new TextRun({ text: 'triage', highlight: 'green' }),
        new TextRun(' stage is new; it routes each request to the right team at once.'), new EndnoteReferenceRun(1)] }),
      new Paragraph({ children: [new TextRun('[[DIAGRAM]]')] }),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Schedule')] }),
      table(schedule, 'grid', [2400, 1800, 1800, 2400]),
      new Paragraph({ children: [new TextRun({ text: 'Decision needed: ', bold: true }), new TextRun({ text: 'approve the pilot budget by February 20.', highlight: 'cyan' })] }),
    ] }] });
const md2 = `# Service Desk Renewal Plan

Staff rated the current service desk as slow in a recent survey.¹ The renewal aims to cut the first-response time by half².

## How a request flows

Every request goes through the same three stages. The triage stage is new; it routes each request to the right team at once.¹

Receive

Triage

Resolve

## Schedule

${md(schedule)}

**Decision needed:** approve the pilot budget by February 20.

The survey ran from 10 to 24 January and had 412 answers.

Measured as the median time from request to first reply.

See the service catalogue, chapter 4, for the full list of request types.
`;
(async () => {
  fs.writeFileSync(path.join(OUT, 'word-tables.docx'), await Packer.toBuffer(doc1)); fs.writeFileSync(path.join(OUT, 'word-tables.md'), md1);
  fs.writeFileSync(path.join(OUT, 'word-rich.docx'), await Packer.toBuffer(doc2)); fs.writeFileSync(path.join(OUT, 'word-rich.md'), md2);
  console.log('ok');
})();
