# PdfImporter's parts (`lib/pdfimport/`)

The five files that carry the importer's pipeline. `lib/PdfImporter.js` is the core (options, shared helpers
in `PdfImporter._internal`, `fromArrayBuffer`, structure tree, Kelk's own source, Markdown); each file here adds
its methods to `PdfImporter.prototype` with `Object.assign`. Plain scripts, no build step, work from `file://`.

Load order, after pdf.js and `MarkdownImporter.js`: `lib/PdfImporter.js`, then `extract`, `lines`, `regions`,
`order`, `blocks` (`PdfImporter.PARTS`). The rules and why each is as it is: [`../PDFIMPORT.md`](../PDFIMPORT.md);
the stage list is in the header of `lib/PdfImporter.js`.

The tables list every method defined in a file, in pipeline order, with its callers and what it does. A step
function stands under its caller, marked `↳`. `fromArrayBuffer` (in the core) drives the pipeline: `_extractPage`,
the repairs, `_classifyFonts`, then `_layout`, then `_toHtml`.

Rule: every function is at most 150 lines (ESLint `max-lines-per-function`, `eslint.config.js`). A long method is
split into steps that take an explicit parameter object, not into closures over its locals.

## extract.js — 1. extraction and Unicode repairs, 2. fonts (PDFIMPORT.md §4, §5)

| Method | Called from | Step |
|---|---|---|
| `_applyActualText` | `_extractPage` | /ActualText of the page's marked content applied to glyphs that have no Unicode of their own |
| ↳ `_pageMarkedTexts` | `_applyActualText` | the page's marked-content texts, read from its content stream(s) |
| `_rawIdx` | `_pageMarkedTexts`, `_rawObjStms`, `_rawBody`, `_fontPrograms`, `_outlineJoins`, `_gsubRepair` | the raw file's object index (plain objects only; none for an encrypted file) |
| `_rawObjStms` | `_fontPrograms` | objects kept inside object streams (font descriptors), as text |
| `_rawBody` | `_pageMarkedTexts`, `_rawStream` | one object's dictionary text, by reference |
| `_rawStream` | `_pageMarkedTexts`, `_rawObjStms`, `_outlineJoins`, `_gsubPrograms` | a stream object's data, plain or Flate (null otherwise) |
| `_mathIn` | `fromArrayBuffer` | formulas from Kelk's own map: what is drawn inside a formula's box goes, one glyph stands in its place |
| `_fontPrograms` | `_outlineJoins`, `_gsubPrograms` | the embedded TrueType programs by font name, read once |
| `_outlineJoins` | `fromArrayBuffer` | forms by outline: which side of a glyph an Arabic letter's joining stroke reaches |
| `_gsubRepair` | `fromArrayBuffer` | ligature glyphs with no Unicode, read from the embedded font's own GSUB table |
| ↳ `_gsubPrograms` | `_gsubRepair` | step 1: each font's program read for its cmap, GSUB and outlines |
| ↳ `_gsubBogus` | `_gsubRepair` | step 2: fonts whose ToUnicode disagrees with their own cmap |
| ↳ `_gsubColour` | `_gsubRepair` | step 3: colour emoji drawn as their layers |
| ↳ `_gsubDigits` | `_gsubRepair` | step 4: each font's digit systems in its ToUnicode |
| ↳ `_gsubArTrust` | `_gsubRepair` | step 5: fonts whose cmap is trusted over their ToUnicode on Arabic letters |
| ↳ `_gsubGlyph` | `_gsubRepair` | step 6: one glyph's repairs from its font's own tables, in order |
| ↳ `_gsubLost` | `_gsubRepair` | step 7: a guess nothing confirmed, in a script the document does not use, becomes U+FFFD |
| `_extractPage` | `fromArrayBuffer` | 1. one page: glyphs, paths, images, links from pdf.js's operator list (the operator walk below) |
| ↳ `_opState` | `_extractPage` | the walk's state: what the page draws, graphics and text state, marked content, font tests |
| ↳ `_opMarked` | `_extractPage` | marked-content operators (BDC / BMC / EMC) |
| ↳ `_opText` | `_extractPage` | text operators: text state and position, shown strings |
| ↳ ↳ `_opMoveText` | `_opText` | the text line matrix moved by (tx, ty) |
| ↳ ↳ `_opGlyphs` | `_opText` | a shown string's glyphs, placed in drawing order with exact positions |
| ↳ `_opGraphics` | `_extractPage` | graphics-state operators: save / restore, forms, CTM, ExtGState, clip, groups, colours |
| ↳ `_opImages` | `_extractPage` | image operators: a picture's box, where its clip lets it show |
| ↳ `_opPaths` | `_extractPage` | paths (constructPath): a clip's path, or the shapes a painted path draws |
| ↳ ↳ `_opShape` | `_opPaths` | one painted (sub-)path: a small mark, a box, a rule, a pattern, or a vector shape |
| ↳ `_unicodeRepair` | `_extractPage` | after the walk: a zero-advance space as the ZWNJ it stands for; text drawn twice at one place |
| ↳ `_hideCovered` | `_extractPage` | after the walk: text and pictures a later opaque fill covers |
| ↳ `_codeRepair` | `_extractPage` | after the walk: a code mapped to U+FFFD in a font that maps ASCII to itself |
| ↳ `_dashedRules` | `_extractPage` | after the walk: a dashed or dotted border drawn dash by dash becomes one rule |
| ↳ `_tinyText` | `_extractPage` | after the walk: text too small to read |
| `_formsByOrder` | `fromArrayBuffer` | glyphs with no Unicode (ligatures, small capitals, Arabic forms): by order of the codes in a row |
| ↳ `_formsRuns` | `_formsByOrder` | step 1: a letter's codes in a row whose widths agree with the forms' order |
| ↳ `_formsPlaces` | `_formsByPlace`, `_formsByOutline` | where each code of a font stands (allows a back join, a forward one) |
| ↳ `_formsByPlace` | `_formsByOrder` | step 2: a letter with fewer codes in a row, by where they stand |
| ↳ `_formsByOutline` | `_formsByOrder` | step 3: forms by outline (`_outlineJoins`) |
| ↳ `_formsByWidth` | `_formsByOrder` | step 4: a letter with fewer codes, by width against its skeleton's read forms |
| `_ornaments` | `fromArrayBuffer` | a few big Latin letters in a font of their own, in a non-Latin document, become a picture mark |
| `_repairUnmapped` | `fromArrayBuffer` | glyphs with no Unicode read as ligatures, small capitals, list numbers and signs |
| ↳ `_unmappedFonts` | `_repairUnmapped` | step 1: per font, its letters' widths and its unmapped codes with neighbours and runs |
| ↳ `_unmappedMaps` | `_repairUnmapped` | step 2: per font, unmapped codes read as ligatures or small capitals |
| ↳ `_unmappedMarkers` | `_repairUnmapped` | step 3: list numbers and signs before numbers with no Unicode |
| `_classifyFonts` | `fromArrayBuffer` | 2. each font classified regular / bold / italic / monospace (by name, else by glyph widths and bbox) |

## lines.js — 3. lines, segments, logical order; 3.5 page furniture (PDFIMPORT.md §6, §6a)

| Method | Called from | Step |
|---|---|---|
| `_lines` | `_pageLines` | 3. one page: glyphs to lines (steps 3a to 3e, then `_streamColumns`) |
| ↳ `_glyphRows` | `_visualLines` | 3a. the page's glyphs as records: emoji and dingbats read, calligraphic letters on one baseline, combining marks merged |
| ↳ `_visualLines` | `_lines` | 3b. glyphs to visual lines: grouped by baseline, each line's glyphs in visual order |
| ↳ `_segments` | `_lines` | 3c. visual lines to segments, cut at column and cell gaps (the word-gap rules are here) |
| ↳ ↳ `_cellEdges` | `_segments` | 3c. evidence of a cell boundary: word edges that line up with other rows |
| ↳ `_joinSegments` | `_lines` | 3d. segments that belong together meet again: raised marks, badges, list markers, numbers set off by a tab |
| ↳ `_finishRows` | `_lines` | 3e. segments to the page's lines: spaces and ZWNJs, kashidas, `finishLine`, raised digits, code runs |
| ↳ ↳ `_wordSpaces` | `_finishRows` | 3e. one row: spaces from the gaps between glyph runs; ZWNJs drawn, undrawn or read from the forms |
| ↳ ↳ `_kashidas` | `_finishRows` | 3e. one row: the kashidas a justified line stretches its words with go |
| ↳ ↳ `_raisedDigits` | `_finishRows` | 3e. one row: raised digits and small roman numerals to superscript / subscript characters |
| ↳ ↳ `_codeRuns` | `_finishRows` | 3e. one row: monospace runs to inline code |
| ↳ `_streamColumns` | `_lines` | columns of a table whose cells touch (no spaces drawn), found from a band no glyph touches |
| `_logical` | `_letterFields`, `_codeBlock`, `_pbNotes`, `_numMarker`, `_joinLines`, `_quoteRuns`, `_lineBreaks`, `_lineMarker`, `_boldLabel`, `_textBlocks` | visual glyphs of a line to logical glyphs for a base direction (the importer's UBA) |
| `_furniture` | `_layout` | 3.5. page furniture: running heads and feet, side panels, page numbers, letterheads, repeated logos |
| ↳ `_furnitureMarked` | `_furniture` | steps 1 and 2: the producer's word (/Artifact) and the structure tree's silence |
| ↳ `_furnitureEvidence` | `_furniture` | step 3: what repeats across the pages, counted once for all pages |
| ↳ `_furnitureCut` | `_furniture` | step 3 on one page: its running head and foot and their rules go, the letter's fields stay |
| ↳ ↳ `_letterFields` | `_furnitureCut` | an office letter's head fields («شماره:», «تاریخ:») kept though they repeat on every page |
| ↳ ↳ `_headChunks` | `_furnitureCut` | a letter's kept head in its reading order, in chunks |
| ↳ `_furnitureDrawn` | `_furniture` | step 3 for what is drawn: pictures, vector parts and fills repeated in a margin zone |

## regions.js — 4. the page driver `_layout`, ruled tables, code boxes, figures (PDFIMPORT.md §7)

| Method | Called from | Step |
|---|---|---|
| `_layout` | `fromArrayBuffer` | 4/5. the page driver: steps 1 to 8 below, then tree tables, joins across pages |
| ↳ `_docSignals` | `_layout` | step 1: document signals read off the glyphs (links, emoji, drawn spaces, ZWNJ, bold, OCR); returns the emoji map |
| ↳ `_pageLines` | `_layout` | step 2: each page's lines (a page whose lines fail is an empty page) |
| ↳ `_lyingShapes` | `_layout` | step 3: fonts whose joining forms lie |
| ↳ `_docLexicon` | `_layout` | step 4: the document's own words and where its long lines start |
| ↳ `_bodyMetrics` | `_layout` | step 5: the body size and the text column's edges |
| ↳ `_bodyFamilies` | `_layout` | step 6: the body text's font family and the heading families |
| ↳ `_bodyPitches` | `_layout` | step 7: the body text's line pitch and the document's pitch of code |
| ↳ `_layoutPage` | `_layout` | step 8 (per page): the page's blocks, its letterhead, pictures out of the text, quality noted |
| ↳ ↳ `_pageFallback` | `_layoutPage` | step 8a: a page whose layout failed, its lines as plain paragraphs |
| `_hiddenPictures` | `_layout` | a picture that draws nothing (transparent soft mask) is dropped |
| `_pageBorders` | `_layout` | a page border (art border tiles, rules, bands) is no content |
| `_calliGaps` | `_layout` | word gaps a calligraphic font closed, restored |
| `_picturesOut` | `_layoutPage` | a raster picture that stood in a line's run of text leaves the line and follows its block as a figure |
| `_tableNotes` | `_layout` | a table's closing note (long text merged over its last rows) leaves the table |
| `_dotMarker` | `_pbMarkers` | a drawn dot or task box beside a line, as the list marker of that line |
| `_clusterFigures` | `_pbClusters` | formula / drawing parts to one box per formula: near on a line, or stacked |
| `_cluster` | `_tables` | boxes merged where they are within a gap |
| `_crop` | `_pbInline`, `_pbFigures` | a figure cropped out of the rendered page |
| `_tables` | `_pbRuledTables` | ruled tables: cells from stroked segments |
| `_tableBlock` | `_pbBlocks` | a ruled table as a block (steps 1 to 6) |
| ↳ `_tableDir` | `_tableBlock` | step 1: the reading direction of the table's columns |
| ↳ `_tableSpans` | `_tableBlock` | step 2: merged cells, joined where no rule parts them |
| ↳ `_cellLinesIn` | `_tableBlock` | step 3 (per cell): the lines whose glyphs fall in a cell's box |
| ↳ `_tableRowSplit` | `_tableBlock` | step 4: grid rows that hold rows drawn without rules, split at their baselines |
| ↳ `_tableTitle` | `_tableBlock` | step 5: a merged first row over the whole table, its title |
| ↳ `_tablePreamble` | `_tableBlock` | step 6: «label: value» rows between the title and the first fully celled row |
| ↳ `_cellItems` | `_tableBlock` | a list inside a table cell: each item keeps its line and its marker as «•» |
| `_codeBlock` | `_pbBlocks`, `_pbUnframedCode`, `_joinPageBreak` | a code box's lines as a code block |

## order.js — 4. reading order: the page's blocks (`_pageBlocks`), XY-cut, borderless tables (PDFIMPORT.md §8.1, §8.3)

| Method | Called from | Step |
|---|---|---|
| `_pageBlocks` | `_layoutPage` | 4. one page: its blocks in reading order (the steps below, in call order) |
| ↳ `_pbCellShading` | `_pageBlocks` | table-cell shading merged into row bands |
| ↳ `_pbLineShading` | `_pageBlocks` | line-by-line shading merged into boxes |
| ↳ `_pbNotes` | `_pageBlocks` | footnotes / endnotes under a separator, their picture marks |
| ↳ `_pbStrike` | `_pageBlocks` | strikethrough rules |
| ↳ `_pbBoxPictures` | `_pageBlocks` | box pictures on lines with box characters, as text |
| ↳ `_pbRuledTables` | `_pageBlocks` | form rows and ruled tables (the flow starts with them) |
| ↳ `_pbBoxes` | `_pageBlocks` | boxes (filled / framed rectangles) |
| ↳ `_pbFences` | `_pageBlocks` | row bands, row rules and column rules (the XY-cut's fences); the outermost boxes |
| ↳ `_pbBoxBlocks` | `_pageBlocks` | boxes that are code or quote blocks (their lines leave the flow) |
| ↳ `_pbQuoteBars` | `_pageBlocks` | quotes drawn as a bare side bar |
| ↳ `_pbMarkers` | `_pageBlocks` | list markers (dots, task boxes, picture bullets); the vector parts left |
| ↳ `_pbClusters` | `_pageBlocks` | figure clusters, less backdrops and decoration |
| ↳ `_pbInline` | `_pageBlocks` | pictures hosted inline by a line, glyphs kept as pictures |
| ↳ `_pbFigures` | `_pageBlocks` | block figures (rows, stacks, trimmed, cropped) into the flow |
| ↳ `_pbRules` | `_pageBlocks` | horizontal rules |
| ↳ `_pbColumns` | `_pageBlocks` | the page's items, direction and measure; XY-cut into column leaves |
| ↳ `_pbFloats` | `_pageBlocks` | lines beside a float |
| ↳ `_pbOrder` | `_pageBlocks` | each leaf's items in reading order, runs of lines grouped |
| ↳ `_pbBlocks` | `_pageBlocks` | the ordered elements as blocks |
| ↳ `_pbMergeBlocks` | `_pageBlocks` | consecutive tables and indentation quotes merged, quotes nested |
| ↳ `_pbUnframedCode` | `_pageBlocks` | unframed code from consecutive monospace paragraphs |
| `_ocrMarkers` | `_pbMarkers` | list marks an OCR layer lost, read from the scan's ink |
| `_ocrInk` | `_docSignals` | what only the scan shows under an OCR layer (bold, size, ink), read from a render of the page |
| `_ocrBox` | `_ocrMarkers` | the scan's ink in a box: the share of dark pixels |
| `_ocrRepair` | `_bodyMetrics` | an OCR layer's lines mended before anything measures them |
| `_formRows` | `_pbRuledTables` | forms: rows of «label: value» pairs set side by side |
| `_dotLattice` | `_pbMarkers` | dot grids: small shapes of one size on a regular lattice |
| `_xyCut` | `_pbColumns` | recursive XY-cut: vertical gutters (columns) before horizontal gaps |
| ↳ `_xyTests` | `_xyCut` | the gap finders and the tests a region's parts are put to |
| ↳ `_xyRegions` | `_xyCut` | the recursive cut of a region into leaves |
| `_rowsLeaf` | `_pbOrder` | a region of short lines in rows: runs of rows with a common gutter become borderless tables |
| ↳ `_rowSpans` | `_rowsLeaf` | the rows' own bounds: shaded bands, or rules a row's height apart |
| ↳ `_ruleColumns` | `_rowsLeaf` | column boundaries of a borderless table from its rules |
| ↳ `_gridTable` | `_rowsLeaf` | a borderless table: rows cut at the common gutters |

## blocks.js — 5. blocks and the structure-tree votes, joined across pages; 6. HTML (PDFIMPORT.md §8.2 to §8.6, §9)

| Method | Called from | Step |
|---|---|---|
| `_treeParagraphs` | `_layout` | structure-tree votes on paragraphs (trusted tree only) |
| `_treeTables` | `_layout` | tables from the structure tree: its rows and columns replace the guessed ones |
| `_treeVote` | `_textBlocks` | the tree's word on a group of lines: null, or { heading, level } |
| `_blockDir` | `_pageFallback`, `_tableBlock`, `_tableTitle`, `_gridTable`, `_textBlocks` | base direction of a block: letter majority, else alignment, else the fallback |
| `_numMarker` | `_quoteRuns`, `_lineMarker` | a number marker («1. », «۱) ») at the logical start of a line |
| `_dehyphenate` | `_joinLines` | a hyphen at a line end: drop it (a broken word) or keep it |
| `_joinLines` | `_layoutPage`, `_pageFallback`, `_tableBlock`, `_tableTitle`, `_formRows`, `_gridTable`, `_textBlocks` | a block's lines joined into a paragraph text |
| `_groupLines` | `_pbOrder`, `_pbBlocks`, `_rowsLeaf` | 8.2. lines of one column to paragraph groups |
| ↳ `_quoteRuns` | `_groupLines` | step 2: quote runs, lines set in on both sides |
| ↳ `_lineBreaks` | `_groupLines` | step 3: each line opens a paragraph group or runs on in the one before |
| ↳ ↳ `_lineMarker` | `_lineBreaks` | step 3a: a line's list marker (number or bullet), unless it is a wrap's |
| `_quoteRtl` | `_pbBoxBlocks`, `_quoteRuns`, `_quoteBlock` | a quote's direction, for its nesting |
| `_boldLabel` | `_pbBoxBlocks`, `_quoteRuns`, `_lineBreaks` | a line that opens with a bold label (30 characters or fewer, ending in a colon) |
| `_leaderLine` | `_lineBreaks`, `_textBlocks`, `_joinStream`, `_joinPageBreak` | a table of contents' line: dot leaders to a page number |
| `_textBlocks` | `_pbBlocks`, `_quoteBlock` | 8.4/8.5. groups of lines to headings, lists, quotes, code or paragraphs |
| ↳ `_quoteBlock` | `_textBlocks` | one quote run as a quote block, its nested quotes as parts of their own |
| `_joinAcrossPages` | `_layout` | 9. blocks joined across page and column breaks (steps 1 to 5) |
| ↳ `_joinPrepare` | `_joinAcrossPages` | step 1: rules at a box's edge, the pages' footnotes, a title page |
| ↳ `_joinStream` | `_joinAcrossPages` | step 2: each block joined to the one before it, or after it |
| ↳ ↳ `_joinRecut` | `_joinStream` | step 2a: rows of a table cut short at a page's foot, recut at its next part's gutters |
| ↳ ↳ `_joinPageBreak` | `_joinStream` | step 2b: a block that opens a page joined to the one that closed the page before |
| ↳ ↳ ↳ `_joinTables` | `_joinPageBreak` | step 2b.1: a table that goes on on the next page |
| ↳ ↳ ↳ ↳ `_joinTailRows` | `_joinTables` | step 2b.2: the last row or two of a table alone at the top of the next page |
| ↳ ↳ ↳ ↳ ↳ `_joinCutRows` | `_joinRecut`, `_joinTailRows` | glyph runs cut at a borderless table's gutters into rows of cells |
| ↳ ↳ ↳ ↳ ↳ `_joinLineGroups` | `_joinRecut`, `_joinTailRows` | the lines of paragraphs as glyph runs, top down |
| ↳ `_joinLineRuns` | `_joinAcrossPages` | step 3: runs of one-line blocks (a code label, a strip of links, a cut heading) |
| ↳ `_joinParagraphs` | `_joinAcrossPages` | step 4: paragraphs broken within a page joined again (round a float, past a sidebar) |
| ↳ `_oneRowTables` | `_joinAcrossPages` | step 5: a one-row ruled table that joined no table, its cells as paragraphs |
| `_toHtml` | `fromArrayBuffer` | 6. blocks to semantic HTML for MarkdownImporter |
| ↳ `_inline` | `_toHtml` | 6. inline HTML of glyphs: bold, italic, code, links, escapes |
| ↳ `_listHtml` | `_toHtml` | a list (nested by level) as <ul> / <ol> |
