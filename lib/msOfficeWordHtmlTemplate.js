/**
 * MSO Word HTML Template — Base Styles & XML Declarations
 * ========================================================
 * 
 * Version: 1.5
 * Used by: WordHtmlBuilder.js (called internally via factory function)
 * 
 * This file defines the base HTML template for generating .doc files
 * that Microsoft Word can open natively. It contains:
 *   - XML namespace declarations (VML, Office, Word, OMML)
 *   - MSO document properties and compatibility settings
 *   - LatentStyles (Word's Style Gallery configuration)
 *   - @font-face definitions
 *   - MSO paragraph, heading, table, and inline styles
 *   - Highlight.js syntax highlighting color scheme
 * 
 * ─────────────────────────────────────────────────────────
 * CONFIGURATION — never edit this file to change fonts or sizes
 * ─────────────────────────────────────────────────────────
 * 
 * All options live in createMsoTemplate.DEFAULTS (frozen, single source
 * of truth). WordHtmlBuilder passes per-document overrides at toHtml():
 * 
 *   WordHtmlBuilder.create()
 *       .setFonts({ bidi: 'Vazirmatn', latin: 'Calibri' })
 *       .setFontSizes({ latin: 11, bidi: 12, code: 10 })   // numbers → pt
 *       .setPage({ size: 'A4', orientation: 'landscape', margin: '2cm' })
 *       .setTemplateOptions({ tableHeaderBg: '#DDEBF7',
 *                             headings: [{ color: '#1F3864' }] })  // h1 only
 *       .addFromHtml(contentHtml)
 *       .toHtml();
 * 
 * Or once for every document:  WordHtmlBuilder.create({ template: {...} })
 * 
 * The template ends at <body> — WordHtmlBuilder appends:
 *   1. <div class="WordSection1"> with document content
 *   2. Hidden <table id="hrdftrtbl"> with MSO header/footer definitions
 *   3. Closing </body></html>
 * 
 * Direction (RTL/LTR) is resolved by WordHtmlBuilder from the content
 * and passed in as the `direction` option; per-element direction
 * overrides and BiDi runs are also WordHtmlBuilder's job.
 * 
 * ─────────────────────────────────────────────────────────
 * RELATIONSHIP WITH Highlight.js
 * ─────────────────────────────────────────────────────────
 * 
 * This template includes CSS classes for Highlight.js syntax
 * highlighting (.hljs-keyword, .hljs-comment, .hljs-string, etc.),
 * but does NOT perform any syntax highlighting itself.
 * 
 * The HTML content passed to WordHtmlBuilder.addFromHtml(contentHtml)
 * must already contain Highlight.js-annotated markup. In other words,
 * hljs.highlight() or hljs.highlightAuto() must be called BEFORE
 * the content reaches this template. For example:
 * 
 *   // In your content pipeline (before WordHtmlBuilder):
 *   const highlighted = hljs.highlight(code, { language: 'js' }).value;
 *   const contentHtml = `<pre><code>${highlighted}</code></pre>`;
 * 
 * This template only provides the color scheme and font-style
 * overrides — it is a passive stylesheet, not a processor.
 * 
 * NOTE — font-style: normal override:
 * "Courier New" does not support italic rendering for Persian/Arabic
 * script (mso-bidi-language: FA). Without this override, Word may
 * apply italic styling (e.g., for .hljs-comment, .hljs-emphasis)
 * which causes Persian characters to render incorrectly or fall back
 * to a different font. Setting font-style: normal on affected classes
 * ensures consistent monospace rendering across all languages.
 * 
 * ─────────────────────────────────────────────────────────
 * MSO FONT RESOLUTION (Bidi)
 * ─────────────────────────────────────────────────────────
 * 
 * In Word's Font dialog (Ctrl+D), two font stacks exist:
 *   - "Latin text":      font-family / font-size
 *   - "Complex script":  mso-bidi-font-family / mso-bidi-font-size
 * 
 * For proper font rendering in mixed-language (bidi) paragraphs:
 *   - Persian/Arabic text should be in  <span dir="RTL" lang="FA">
 *   - English/Latin text should be in   <span dir="LTR">
 * 
 * If both Persian and English text appear as bare text in a single <p>
 * WITHOUT span wrappers, Word cannot correctly resolve font name, family,
 * and size — the Latin text may render with the wrong font (e.g., the bidi
 * font instead of the Latin one). WordHtmlBuilder._wrapBidiRuns() handles this
 * automatically by segmenting mixed text nodes into directional spans.
 * 
 * ─────────────────────────────────────────────────────────
 * STYLE GALLERY — Normal (Web)
 * ─────────────────────────────────────────────────────────
 * 
 * If a <p> element lacks class="MsoNormal", Word displays it as
 * "Normal (Web)" in the Style Editor — a style that is hidden from
 * the Style Gallery by default.
 * 
 * WordHtmlBuilder._assignWordStyleClasses() automatically adds
 * class="MsoNormal" to unstyled <p>, <li>, <div> elements.
 * 
 * To make "Normal (Web)" visible in Word's Style Gallery for debugging,
 * uncomment this line in the LatentStyles section:
 *   <w:LsdException Locked="false" Priority="59" QFormat="true"
 *                    Name="Normal (Web)"/>
 * 
 * ─────────────────────────────────────────────────────────
 * ADDING NEW SECTIONS (e.g., Landscape Page)
 * ─────────────────────────────────────────────────────────
 * 
 * To insert a new section (e.g., switching from portrait to landscape
 * mid-document), use a section break via MSO-specific CSS:
 * 
 * 1. Define a new @page rule in this template:
 *
 *      @page WordSection2 {
 *          size: 29.7cm 21.0cm;
 *          mso-page-orientation: landscape;
 *          margin: 1.5cm;
 *          mso-header-margin: 0.7cm;
 *          mso-footer-margin: 0.7cm;
 *          mso-header: h1;
 *          mso-footer: f1;
 *      }
 *      div.WordSection2 { page: WordSection2; }
 *
 * 2. In the HTML body, close the current section and open the new one:
 *
 *      <div class="WordSection1">
 *          ... portrait content ...
 *          <p style="mso-break-type:section-break; page-break-before:always">&nbsp;</p>
 *      </div>
 *      <div class="WordSection2">
 *          ... landscape content ...
 *      </div>
 *
 * Each section can have its own page size, orientation, margins,
 * and header/footer references (mso-header / mso-footer).
 * 
 * 
 * ─────────────────────────────────────────────────────────
 * REFERENCES
 * ─────────────────────────────────────────────────────────
 * 
 * @see https://www.goodemailcode.com/email-enhancements/mso-styles.html
 * @see https://stigmortenmyre.no/mso/html/concepts/ofconstyletable.htm
 */


var createMsoTemplate = (function () {
  'use strict';

  // ===========================================================================
  // Defaults — the SINGLE source of truth for every template option.
  // Override per document via WordHtmlBuilder (setFonts / setFontSizes /
  // setPage / setTemplateOptions) — never by editing this file.
  // Frozen and exposed as createMsoTemplate.DEFAULTS for inspection.
  // ===========================================================================
  const DEFAULTS = Object.freeze({

    // ── Direction & Alignment ──────────────────
    direction: 'rtl',            // 'rtl' | 'ltr' — resolved by WordHtmlBuilder
    textAlign: 'justify',        // body paragraphs

    // ── Fonts ──────────────────────────────────
    //    Word keeps two font stacks per run (Font dialog, Ctrl+D):
    //      "Latin text"     → font-family / font-size
    //      "Complex script" → mso-bidi-font-family / mso-bidi-font-size
    bidiLanguage: 'FA',          // mso-bidi-language
    latinFont: 'Calibri',
    latinFontFallback: 'sans-serif',
    bidiFont: 'B Nazanin',
    codeFont: 'Courier New',
    codeFontFallback: 'monospace',
    codeBidiFont: '',            // RTL text inside code; '' → codeFont (set by
                                 // setCodeBlockOptions({ rtlFont: 'document' }))

    // ── Font Sizes ─────────────────────────────
    fontSize: '11.5pt',          // Latin
    bidiFontSize: '12.0pt',      // Complex Script
    codeFontSize: '10.0pt',      // pre/code (both stacks)

    // ── Headings (index 0 = h1 … 5 = h6) ───────
    //    Partial overrides merge per level: { headings: [ , { color:'#000' } ] }
    headings: Object.freeze([
      Object.freeze({ size: '15.0pt', color: '#44546A' }),
      Object.freeze({ size: '14.0pt', color: '#293E1A' }),
      Object.freeze({ size: '13.0pt', color: '#666666' }),
      Object.freeze({ size: '12.0pt', color: '#204F7A' }),
      Object.freeze({ size: '12.0pt', color: '#6C5200' }),
      Object.freeze({ size: '12.0pt', color: '#000000', italic: true })
    ]),
    headingMarginTopBase: 20,    // margin-top = base − level × 2  (h1=18pt … h6=8pt)
    headingMarginBottom: '6.0pt',
    titleFontSize: '15.0pt',     // p.MsoTitle
    subtitleFontSize: '13.0pt',  // p.MsoSubtitle
    tocHeadingFontSize: '14.0pt',

    // ── Colors ─────────────────────────────────
    linkColor: '#0563C1',
    linkVisitedColor: '#954F72',
    tableBorder: 'solid windowtext 1.0pt',
    tableHeaderBg: '#E4E9EF',    // table style: the default header fill (BuilderBase.setTableStyle)
    quoteBorderColor: '#1F6F5C',
    quoteBg: '#F6F9F8',          // fill of the quote box ('' / null: none)
    quoteBorderWidth: '3.5pt',
    quoteIndent: '14.15pt',      // start-side indent of the quote block
    // lists (docx, pdf, html): text of level n at listIndent + (n−1) × listIndentStep
    // from the item's own start side; the marker sits listHanging before the text
    listIndent: '24pt',
    listIndentStep: '18pt',
    listHanging: '14pt',
    quotePadding: '12pt',        // gap between the quote border and its text
    quoteTextColor: '#4A4A4A',
    codeBlockBorder: '0.75pt solid #D4D0C8',
    codeBlockBg: '#FCFCFC',
    codeHeaderBg: '#E7F1EE',     // code block language bar
    codeHeaderColor: '#595959',
    codeHeaderFontSize: '8.0pt',
    tocHeadingColor: '#2F5496',

    // ── Line Spacing ───────────────────────────
    //    normal : body paragraphs, headings, quotes
    //    tight  : list items, table cells, code blocks
    lineHeight: '110%',
    lineHeightTight: '100%',
    lineHeightRule: 'auto',      // 'auto' | 'exactly' | 'at-least'
    //  Fixed line height:  lineHeight: '18pt', lineHeightRule: 'exactly'

    // ── Page Setup ─────────────────────────────
    pageSize: '21.0cm 29.7cm',   // A4 portrait (width height)
    pageOrientation: 'portrait',
    pageMargin: '1.5cm',
    headerMargin: '0.7cm',
    footerMargin: '0.7cm',

    // ── Paragraph Margins ──────────────────────
    paraMarginTop: '4pt',
    paraMarginBottom: '6pt',
    paraMarginTopTight: '0pt',
    paraMarginBottomTight: '0pt',
    listItemSpaceAfter: '1.5pt'    // extra space after each list item (≈ 10% of a line), all outputs
  });

  /**
   * PANOSE-1 signatures for fonts Word commonly substitutes. Emitted in
   * @font-face when known; any other font gets a plain @font-face (Word
   * then resolves it by name, which is fine for installed fonts).
   */
  const PANOSE = {
    'cambria math':    '2 4 5 3 5 4 6 3 2 4',
    'calibri':         '2 15 5 2 2 2 4 3 2 4',
    'b nazanin':       '0 0 4 0 0 0 0 0 0 0',
    'courier new':     '2 7 3 9 2 2 5 2 4 4',
    'arial':           '2 11 6 4 2 2 2 2 2 4',
    'times new roman': '2 2 6 3 5 4 5 2 3 4',
    'tahoma':          '2 11 6 4 3 5 4 4 2 4'
  };

  // Static parts — built once at load time, not on every call.
  const XML_HEAD = `<html xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:w="urn:schemas-microsoft-com:office:word"
  xmlns:m="http://schemas.microsoft.com/office/2004/12/omml"
  xmlns="http://www.w3.org/TR/REC-html40">

<head>
  <meta http-equiv=Content-Type content="text/html; charset=UTF-8">
  <meta name=ProgId content=Word.Document>
  <meta name=Generator content="Microsoft Word 15">
  <meta name=Originator content="Microsoft Word 15">
<!--[if gte mso 9]><xml>
 <o:DocumentProperties>
  <o:Author></o:Author>
  <o:LastAuthor></o:LastAuthor>
  <o:Revision>1</o:Revision>
  <o:TotalTime>1</o:TotalTime>
  <o:Version>16.00</o:Version>
 </o:DocumentProperties>
 <o:OfficeDocumentSettings>
  <o:AllowPNG/>
 </o:OfficeDocumentSettings>
</xml><![endif]-->
<!--[if gte mso 9]><xml>
 <w:WordDocument>
  <w:SpellingState>Clean</w:SpellingState>
  <w:GrammarState>Clean</w:GrammarState>
  <w:TrackMoves>false</w:TrackMoves>
  <w:TrackFormatting/>
  <w:PunctuationKerning/>
  <w:ValidateAgainstSchemas/>
  <w:SaveIfXMLInvalid>false</w:SaveIfXMLInvalid>
  <w:IgnoreMixedContent>false</w:IgnoreMixedContent>
  <w:AlwaysShowPlaceholderText>false</w:AlwaysShowPlaceholderText>
  <w:DoNotPromoteQF/>
  <w:LidThemeOther>EN-US</w:LidThemeOther>
  <w:LidThemeAsian>X-NONE</w:LidThemeAsian>
  <w:LidThemeComplexScript>AR-SA</w:LidThemeComplexScript>
  <w:Compatibility>
   <w:BreakWrappedTables/>
   <w:SnapToGridInCell/>
   <w:WrapTextWithPunct/>
   <w:UseAsianBreakRules/>
   <w:DontGrowAutofit/>
   <w:SplitPgBreakAndParaMark/>
   <w:EnableOpenTypeKerning/>
   <w:DontFlipMirrorIndents/>
   <w:OverrideTableStyleHps/>
  </w:Compatibility>
  <m:mathPr>
   <m:mathFont m:val="Cambria Math"/>
   <m:brkBin m:val="before"/>
   <m:brkBinSub m:val="&#45;-"/>
   <m:smallFrac m:val="off"/>
   <m:dispDef/>
   <m:lMargin m:val="0"/>
   <m:rMargin m:val="0"/>
   <m:defJc m:val="centerGroup"/>
   <m:wrapIndent m:val="1440"/>
   <m:intLim m:val="subSup"/>
   <m:naryLim m:val="undOvr"/>
  </m:mathPr></w:WordDocument>
</xml><![endif]--><!--[if gte mso 9]><xml>
 <w:LatentStyles DefLockedState="false" DefUnhideWhenUsed="false"
  DefSemiHidden="false" DefQFormat="false" DefPriority="99"
  LatentStyleCount="376">
      <w:LsdException Locked="false" Priority="0" QFormat="true" Name="Normal"/>
      <w:LsdException Locked="false" Priority="9" QFormat="true" Name="heading 1"/>
      <w:LsdException Locked="false" Priority="9" QFormat="true" Name="heading 2"/>
      <w:LsdException Locked="false" Priority="9" QFormat="true" Name="heading 3"/>
      <w:LsdException Locked="false" Priority="9" QFormat="true" Name="heading 4"/>
      <w:LsdException Locked="false" Priority="9" QFormat="true" Name="heading 5"/>
      <w:LsdException Locked="false" Priority="9" QFormat="true" Name="heading 6"/>
      <w:LsdException Locked="false" Priority="22" QFormat="true" Name="Strong"/>
      <w:LsdException Locked="false" Priority="20" QFormat="true" Name="Emphasis"/>
      <w:LsdException Locked="false" Priority="20" QFormat="true" Name="Title"/>
      <w:LsdException Locked="false" Priority="20" QFormat="true" Name="SubTitle"/>
      <w:LsdException Locked="false" Priority="20" QFormat="true" Name="Quote"/>
      <!-- <w:LsdException Locked="false" Priority="59" QFormat="true" Name="Normal (Web)"/> -->
 </w:LatentStyles>
</xml>
<![endif]-->
`;
  const HLJS_CSS = `/* Highlight.js Syntax Highlighting */
.hljs-keyword { color: #0000ff; }
.hljs-built_in { color: #0000ff; }
.hljs-type { color: #267f99; }
.hljs-literal { color: #0000ff; }
.hljs-symbol { color: #0000ff; }
.hljs-meta { color: #0000ff; }
.hljs-title { color: #795e26; }
.hljs-function { color: #795e26; }
.hljs-class { color: #267f99; }
.hljs-variable { color: #001080; }
.hljs-params { color: #001080; }
.hljs-property { color: #001080; }
.hljs-attr { color: #e50000; }
.hljs-string { color: #a31515; font-style: normal; }
.hljs-regexp { color: #811f3f; }
.hljs-char { color: #a31515; }
.hljs-comment { color: #008000; font-style: normal; }
.hljs-doctag { color: #008000; font-style: normal; }
.hljs-number { color: #098658; }
.hljs-tag { color: #800000; }
.hljs-name { color: #800000; }
.hljs-selector-class { color: #800000; }
.hljs-selector-id { color: #800000; }
.hljs-operator { color: #000000; }
.hljs-punctuation { color: #000000; }
.hljs-section { color: #0000ff; font-weight: bold; }
.hljs-link { color: #0366d6; }
.hljs-link-url { color: #032f62; text-decoration: underline; }
.hljs-strong { color: #000000; font-weight: bold; }
.hljs-emphasis { color: #000000; font-style: normal; }
.hljs-bullet { color: #0000ff; }
.hljs-quote { color: #6a737d; }
.hljs-blockquote { color: #6a737d; font-style: normal; }
.hljs-deletion { color: #a31515; background-color: #fdd; }
.hljs-addition { color: #008000; background-color: #dfd; }

`;

  /** Merge caller overrides onto DEFAULTS; undefined values are ignored. */
  function resolveConfig(overrides) {
    const c = Object.assign({}, DEFAULTS);
    for (const k in overrides) {
      if (Object.prototype.hasOwnProperty.call(overrides, k) && overrides[k] !== undefined) {
        c[k] = overrides[k];
      }
    }
    // Headings merge per level so one color can change without restating all six.
    const ho = overrides.headings || [];
    c.headings = DEFAULTS.headings.map(function (d, i) {
      return Object.assign({}, d, ho[i] || {});
    });
    return c;
  }

  function fontFace(name) {
    const p = PANOSE[String(name).toLowerCase()];
    return '@font-face {\n\tfont-family:"' + name + '";' +
           (p ? '\n\tpanose-1:' + p + ';' : '') + '\n}';
  }

  /**
   * Create the MSO Word HTML template (everything up to and including <body>).
   * Called internally by WordHtmlBuilder.toHtml() — not intended for direct use.
   *
   * @param {object} [overrides] - any subset of createMsoTemplate.DEFAULTS
   * @returns {string}
   */
  function createMsoTemplate(overrides = {}) {
    const C = resolveConfig(overrides);

    // Direction-dependent sides for quotes (border + indent on the start side)
    const isRTL = C.direction === 'rtl';
    const start = isRTL ? 'right' : 'left';
    const end   = isRTL ? 'left'  : 'right';

    // ── CSS fragments — computed ONCE per call ──
    const font =
`mso-bidi-language:${C.bidiLanguage};
  unicode-bidi:embed;
  font-family:"${C.latinFont}",${C.latinFontFallback};
  mso-ascii-font-family:"${C.latinFont}";
  mso-hansi-font-family:"${C.latinFont}";
  mso-bidi-font-family:"${C.bidiFont}";`;
    const size =
`font-size:${C.fontSize};
  mso-bidi-font-size:${C.bidiFontSize};`;
    const spacing =
`line-height:${C.lineHeight};
  mso-line-height-rule:${C.lineHeightRule};`;
    const spacingTight =
`line-height:${C.lineHeightTight};
  mso-line-height-rule:${C.lineHeightRule};`;
    const dir =
`direction:${C.direction};
  text-align:${C.textAlign};`;
    const margin =
`margin-top:${C.paraMarginTop};
  margin-right:0cm;
  margin-bottom:${C.paraMarginBottom};
  margin-left:0cm;`;
    const marginTight =
`margin-top:${C.paraMarginTopTight};
  margin-right:0cm;
  margin-bottom:${C.paraMarginBottomTight};
  margin-left:0cm;`;
    const all = `${font}\n  ${size}\n  ${spacing}`;
    const allTight = `${font}\n  ${size}\n  ${spacingTight}`;
    const codeFontStack =
`font-family:"${C.codeFont}", ${C.codeFontFallback};
  mso-ascii-font-family:"${C.codeFont}";
  mso-hansi-font-family:"${C.codeFont}";
  mso-bidi-font-family:"${C.codeBidiFont || C.codeFont}";
  font-size:${C.codeFontSize};
  mso-bidi-font-size:${C.codeFontSize};`;

    // @font-face for every font actually used (deduplicated)
    const fontFaces = Array.from(new Set(['Cambria Math', C.latinFont, C.bidiFont, C.codeFont, C.codeBidiFont].filter(Boolean)))
      .map(fontFace).join('\n');

    const headingCss = C.headings.map(function (h, i) {
      const lvl = i + 1;
      return `h${lvl}, p.MsoHeading${lvl} {
  font-size: ${h.size};
  mso-bidi-font-size:${h.size};
  color:${h.color};${h.italic ? '\n  font-style: italic;' : ''}
  margin-top: ${C.headingMarginTopBase - lvl * 2}pt;
  margin-bottom: ${C.headingMarginBottom};
  page-break-after: avoid;
  font-weight: bold;
  ${dir}
  ${font}
  ${spacing}
}`;
    }).join('\n');

    return XML_HEAD + `  <style>
/* Font Definitions */
${fontFaces}

/* Word-specific styling */

.MsoChpDefault {
  mso-style-type:export-only;
  mso-default-props:yes;
}

.MsoPapDefault {
  mso-style-type:export-only;
  ${dir}
  margin-bottom:${C.paraMarginBottom};
}

/* Page Setup */
@page WordSection1 {
  size: ${C.pageSize};
  margin:${C.pageMargin};
  mso-page-orientation: ${C.pageOrientation};
  mso-gutter: 0cm;
  mso-header-margin:${C.headerMargin};
  mso-footer-margin:${C.footerMargin};
  mso-paper-source:0;
  mso-header: h1;
  mso-footer: f1;
}

div.WordSection1 {page:WordSection1;}

table.MsoNormalTable, table.headerFooterTable {
  mso-style-name:"Table Normal";
  border-collapse: collapse;
  ${marginTight}
  mso-tstyle-rowband-size:0;
  mso-tstyle-colband-size:0;
  mso-style-noshow:yes;
  mso-style-priority:99;
  mso-style-parent:"";
  mso-padding-alt:0cm 5.4pt 0cm 5.4pt;
  mso-para-margin-top:0cm;
  mso-para-margin-right:0cm;
  mso-para-margin-bottom:8.0pt;
  mso-para-margin-left:0cm;
  mso-pagination:widow-orphan;
  ${allTight}
}

/* only the header/footer table spans the text: a content table's width is its own
   (inline, from WordHtmlBuilder — a class width here overrides it in list items) */
table.headerFooterTable {
  width: 98%;
}

th, td {
  border: ${C.tableBorder};
  padding: 1pt;
  direction: ${C.direction};
}

/* a content table's lines, fills and weight are inline on each cell (BuilderBase table style) */
th {
  font-weight: bold;
}

/* hidden table for header/footer */
table#hrdftrtbl {
  margin:0in 0in 0in 900in;
  width:1px;
  height:1px;
  overflow:hidden;
}

p.MsoNormal, div.MsoNormal {
  mso-style-unhide:no;
  mso-style-qformat:yes;
  mso-style-parent:"";
  ${margin}
  ${dir}
  mso-pagination:widow-orphan;
  ${all}
}

/* Same as p.MsoNormal above, except margins are 0 for tighter list spacing */
li.MsoNormal {
  mso-style-unhide:no;
  mso-style-qformat:yes;
  mso-style-parent:"";
  ${marginTight}
  direction: ${C.direction};
  mso-pagination:widow-orphan;
  ${allTight}
}
li.MsoNormal { margin-bottom: ${C.listItemSpaceAfter}; mso-margin-bottom-alt: ${C.listItemSpaceAfter}; }

a:link, span.MsoHyperlink {
  mso-style-priority:99;
  color:${C.linkColor};
  mso-themecolor:hyperlink;
  text-decoration:underline;
  text-underline:single;
  ${all}
}
a:visited, span.MsoHyperlinkFollowed {
  mso-style-noshow:yes;
  mso-style-priority:99;
  color:${C.linkVisitedColor};
  mso-themecolor:followedhyperlink;
  text-decoration:underline;
  text-underline:single;
  ${all}
}

/* Keep each Word style in its OWN rule, with the Mso class selector first:
 * Word maps a CSS rule to a Style-gallery style by its selectors, and
 * grouping two styles (or leading with a bare HTML element) can leave the
 * gallery style without these properties. */
span.MsoStrong, strong {
  ${all}
}

span.MsoEmphasis, em {
  ${all}
}

p.MsoTOCHeading {
  text-align: ${start};
  color: ${C.tocHeadingColor};
  font-size: ${C.tocHeadingFontSize};
  mso-bidi-font-size: ${C.tocHeadingFontSize};   /* the same size for Persian text (as .docx / .pdf) */
  font-weight: bold;
  ${font}
  ${spacing}
}

/* table of contents entries: Word's built-in "toc 1…3" (WordHtmlBuilder setToc) */
p.MsoToc1, li.MsoToc1, div.MsoToc1,
p.MsoToc2, li.MsoToc2, div.MsoToc2,
p.MsoToc3, li.MsoToc3, div.MsoToc3 {
  mso-style-update: auto;
  mso-style-priority: 39;
  mso-style-next: Normal;
  margin-top: 0pt;
  margin-bottom: 5pt;
  margin-${start}: 0pt;
  text-align: ${start};
  ${dir}
  mso-pagination: widow-orphan;
  ${font}
}
p.MsoToc2, li.MsoToc2, div.MsoToc2 { margin-${start}: 11pt; }
p.MsoToc3, li.MsoToc3, div.MsoToc3 { margin-${start}: 22pt; }

p.MsoTitle {
  margin-top: 6pt;
  margin-bottom: 6pt;
  font-size: ${C.titleFontSize};
  font-weight: bold;
  ${dir}
  ${font}
  ${spacing}
}

p.MsoSubtitle {
  margin-top: 6pt;
  margin-bottom: 6pt;
  font-size: ${C.subtitleFontSize};
  font-style: italic;
  ${dir}
  ${font}
  ${spacing}
}

/* Heading styles */
${headingCss}

/* Quote — two forms, chosen per quote by WordHtmlBuilder:
 *
 * SIMPLE (text-only quotes, the common case): plain <p class="MsoQuote">
 *   paragraphs. Border, indent and padding belong to this style — i.e. to
 *   Word's built-in "Quote" in the Style gallery — so the user can restyle
 *   or remove it in Word; consecutive paragraphs join into one border line.
 *
 * TABLE (quotes containing lists, nested quotes, code, tables): a single-cell
 *   table.MsoQuoteTable whose cell draws the border (inline), because a
 *   paragraph border breaks at every list/nested indent. Paragraphs inside
 *   the cell cancel this rule's border/indent inline.
 *
 * The bare blockquote selector is the non-browser fallback (no conversion). */
/* A filled quote has a hairline in its fill color on the end side, with padding EQUAL to the
 * bar's: Word positions a paragraph's shading using the border spacing of the OPPOSITE side, so
 * unequal spacings shift the fill (a white gap at the bar, or past it). Keep padding-left and
 * padding-right equal (change them together); the hairline's color must equal the fill color.
 * ONE rule per Word style class: Word keys a style by its CLASS (MsoQuote →
 * "Quote"), not by the element. A later rule for the same class — even
 * li.MsoQuote — redefines the style, so a separate borderless li.MsoQuote
 * rule stripped the border from the gallery "Quote" style. List items in a
 * table-form quote cancel the border inline instead (WordHtmlBuilder). */
p.MsoQuote, li.MsoQuote, div.MsoQuote {
  mso-style-priority:29;
  mso-style-unhide:no;
  mso-style-qformat:yes;
  mso-style-next:Normal;
  margin-top: ${C.paraMarginTop};
  margin-bottom: ${C.paraMarginBottom};
  margin-${start}: ${C.quoteIndent};
  margin-${end}: 0cm;
  border: none;
  border-${start}: solid ${C.quoteBorderColor} ${C.quoteBorderWidth};
  ${C.quoteBg ? 'border-' + end + ': solid ' + C.quoteBg + ' .25pt;' : ''}
  padding-top: 2pt;
  padding-bottom: 2pt;
  padding-${start}: ${C.quotePadding};
  padding-${end}: ${C.quoteBg ? C.quotePadding : '0pt'};
  ${C.quoteBg ? 'background: ' + C.quoteBg + ';' : ''}
  color: ${C.quoteTextColor};
  font-style: italic;
  ${dir}
  ${font}
  ${size}
  ${spacing}
}

/* Non-browser fallback only (no blockquote → MsoQuote conversion ran).
 * Deliberately a SEPARATE rule from p.MsoQuote above — see note at Strong. */
blockquote {
  margin-top: ${C.paraMarginTop};
  margin-bottom: ${C.paraMarginBottom};
  margin-${start}: ${C.quoteIndent};
  margin-${end}: 0cm;
  border: none;
  border-${start}: solid ${C.quoteBorderColor} ${C.quoteBorderWidth};
  ${C.quoteBg ? 'border-' + end + ': solid ' + C.quoteBg + ' .25pt;' : ''}
  padding-top: 2pt;
  padding-bottom: 2pt;
  padding-${start}: ${C.quotePadding};
  padding-${end}: ${C.quoteBg ? C.quotePadding : '0pt'};
  ${C.quoteBg ? 'background: ' + C.quoteBg + ';' : ''}
  color: ${C.quoteTextColor};
  font-style: italic;
  ${dir}
  ${font}
  ${size}
  ${spacing}
}

table.MsoQuoteTable {
  border-collapse: collapse;
  border: none;
  width: 98%;
  margin-top: ${C.paraMarginTop};
  margin-bottom: ${C.paraMarginBottom};
}

pre, code {
  direction: ltr;
  text-align: left;
  unicode-bidi: embed;
  mso-bidi-language:${C.bidiLanguage};
  ${codeFontStack}
  ${marginTight}
  ${spacingTight}
}

pre {
  border: ${C.codeBlockBorder};
  padding: 6px;
  background-color: ${C.codeBlockBg};
  width: 98%;
  margin-top: 6pt;
  margin-bottom: 6pt;
}

` + HLJS_CSS + `  </style>
</head>
<body lang=EN-US style='tab-interval:36.0pt;word-wrap:break-word'>
`;
  }

  createMsoTemplate.DEFAULTS = DEFAULTS;
  return createMsoTemplate;
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createMsoTemplate };
}
