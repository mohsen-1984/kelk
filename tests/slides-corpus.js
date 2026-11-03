/**
 * Slides test corpus — var SLIDES_CORPUS = [...], run by slides-suite.html through PptxBuilder.
 * Each case: { name, md, config?, expect } — expect may hold:
 *   slides       number of slides
 *   layouts      { index: 'layout' } (the layout chosen; 'timeline' matches 'timeline vertical')
 *   notes        number of slides with speaker notes
 *   warn         warning codes that must appear (anywhere in the deck)
 *   noWarn       true: no warning at all
 *   dir          'rtl' | 'ltr'
 *   charts       number of native charts in the .pptx
 *   hidden       number of hidden slides in the .pptx
 *   text         strings that must be in the .pptx's slide XML
 *   titles       slide titles in order (in title placeholders)
 *   runs         strings that must be whole runs (<a:t>…</a:t>): the script pieces of BiDi text
 *   notesRtl     true: the speaker notes have a right-to-left paragraph
 */
var SLIDES_CORPUS = [
    {
        name: 'bidi-pieces',
        md: '## ترکیب Mixed\n\n- در PowerPoint با «Edit Data» ویرایش می‌شود\n- هخامنشی (Achaemenid)، از سرزمین پارس\n- مدل GPT-3 در سال 2020 – با 175 میلیارد پارامتر\n- مدل‌های text-to-image و سال‌های 2012–2017 — یک خط تیرهٔ بلند\n\n<!-- یادداشت فارسی با English و عدد 42 — و خط تیره‌ها: a-b، 2012–2017. -->\n',
        expect: { runs: ['PowerPoint', 'Edit Data', 'Achaemenid', 'GPT-3', 'text-to-image', '2020', '2012', '2017'], notesRtl: true }
    },
    {
        name: 'themes',
        md: '# Dark deck\n\n## Cards\n<!-- layout: cards -->\n\n- :rocket: **One** — a\n- :shield: **Two** — b\n\n## Chart\n<!-- chart: column -->\n\n| a | b |\n|---|---|\n| x | 1 |\n| y | 2 |\n',
        config: { slides: { theme: 'tech-dark' } },
        expect: { slides: 3, charts: 1, noWarn: true, text: ['0F172A'] }
    },
    {
        name: 'theme-old-name',
        md: '---\ntheme: pasargad\n---\n\n## A\n\n- a\n',
        config: { slides: { theme: 'kelk' } },
        expect: { slides: 1, noWarn: true }
    },
    {
        name: 'nested-quote-and-code',
        md: '## Quote\n\n> Outer words\n>\n> > inner words\n>\n> — Someone\n\n## Code in a list\n\n- an item\n\n  ```js\n  let a = 1;\n  ```\n\n## Code with a nested fence\n\n````markdown\n```js\nlet b = 2;\n```\n````\n\n## Code RTL\n\n```text\nنقش (Role): تو معلم هستی.\nقالب (Format): یک جدول A–D.\n```\n',
        expect: { layouts: { 0: 'quote' }, warn: ['list-block'], text: ['inner words', 'let b = 2;', 'معلم'] }
    },
    {
        name: 'basics-rtl',
        md: '# عنوان ارائه\n\nزیرعنوان\n\n## اسلاید یک\n\n- بند اول\n- بند دوم\n  - زیربند\n\n<!-- یادداشت سخنران -->\n\n## اسلاید دو\n\nیک پاراگراف با **پررنگ** و *کج* و `code` و [پیوند](https://example.com).\n\n- مورد\n',
        expect: { slides: 3, layouts: { 0: 'title', 1: 'bullets', 2: 'bullets' }, notes: 1, dir: 'rtl', titles: ['عنوان ارائه', 'اسلاید یک', 'اسلاید دو'], text: ['زیربند', 'پیوند'] }
    },
    {
        name: 'basics-ltr',
        md: '# A deck\n\nThe subtitle\n\n## First slide\n\n- One\n- Two\n\n## Second slide\n\n1. First\n2. Second\n',
        expect: { slides: 3, dir: 'ltr', layouts: { 1: 'bullets', 2: 'bullets' }, noWarn: true }
    },
    {
        name: 'front-matter',
        md: '---\ntitle: Deck title\nfooter: My footer\ndir: rtl\ntheme: ocean\naspect: 4:3\nauthor: Someone\ndate: 2026\n---\n\n# Hello\n\n## Slide\n\nText in English only.\n',
        expect: { slides: 2, dir: 'rtl', text: ['My footer', 'Someone · 2026'], aspect: '4:3' }
    },
    {
        name: 'no-title-slide',
        md: '## Only content\n\n- a\n- b\n\n## Another\n\n- c\n',
        expect: { slides: 2, layouts: { 0: 'bullets' } }
    },
    {
        name: 'statement-and-quote',
        md: '## Statement\n\nOne short sentence that stands alone.\n\n## Quote\n\n> Words worth quoting, said once.\n>\n> — Someone\n',
        expect: { layouts: { 0: 'statement', 1: 'quote' } }
    },
    {
        name: 'columns-two-three',
        md: '## Two\n\n### Left\n\n- a\n\n### Right\n\n- b\n\n## Three\n\n### A\n\ntext\n\n### B\n\ntext\n\n### C\n\ntext\n',
        expect: { layouts: { 0: 'columns', 1: 'columns' } }
    },
    {
        name: 'auto-steps-and-cards',
        md: '## Steps\n\n1. **Plan** — think\n2. **Build** — make\n3. **Check** — test\n\n## Cards\n\n- **One**\n  - a\n- **Two**\n  - b\n- **Three**\n  - c\n\n## Cards by icons\n\n- :rocket: **Fast** — quick\n- :shield: **Safe** — sound\n',
        expect: { layouts: { 0: 'steps', 1: 'cards', 2: 'cards' }, noWarn: true }
    },
    {
        name: 'emoji-icons',
        md: '## Features\n<!-- layout: cards -->\n\n- 🚀 **Fast** — quick\n- 🛡️ **Safe** — sound\n- 🌍 **Open** — for all\n',
        expect: { layouts: { 0: 'cards' }, text: ['🚀'] }
    },
    {
        name: 'unknown-icon',
        md: '## Icons\n<!-- layout: cards -->\n\n- :no-such-icon-here: **A** — a\n- :rocket: **B** — b\n',
        expect: { warn: ['icon'] }
    },
    {
        name: 'stats-row-and-column',
        md: '## Row\n<!-- layout: stats -->\n\n- **42%** — growth\n- **3×** — speed\n- **12** — teams\n\n## Column\n<!-- layout: stats column -->\n\n- **7** — days\n- **Detail** — a note beside\n',
        expect: { layouts: { 0: 'stats', 1: 'stats' } }
    },
    {
        name: 'timeline-horizontal-vertical',
        md: '## H\n<!-- layout: timeline horizontal highlight=2 -->\n\n- **2020** — start\n- **2022** — growth\n- **2024** — today\n\n## V\n<!-- layout: timeline vertical -->\n\n- **2020** — start\n- **2022** — growth\n\n## Auto (long)\n<!-- layout: timeline -->\n\n- **1** — a\n- **2** — b\n- **3** — c\n- **4** — d\n- **5** — e\n- **6** — f\n- **7** — g\n',
        expect: { layouts: { 0: 'timeline horizontal', 1: 'timeline vertical', 2: 'timeline vertical' } }
    },
    {
        name: 'timeline-setting-vertical',
        md: '## T\n<!-- layout: timeline -->\n\n- **A** — a\n- **B** — b\n',
        config: { slides: { timeline: 'vertical' } },
        expect: { layouts: { 0: 'timeline vertical' } }
    },
    {
        name: 'agenda-auto',
        md: '# Deck\n\n## Agenda\n<!-- layout: agenda -->\n\n# Part one\n\n## A\n\ntext\n\n# Part two\n\n## B\n\ntext\n\n# Thanks\n',
        expect: { layouts: { 1: 'agenda', 2: 'section', 6: 'section' }, text: ['Part one', 'Part two', '01', '02'] }
    },
    {
        name: 'diagrams',
        md: '## Process\n<!-- layout: process -->\n\n1. **A** — a\n2. **B** — b\n3. **C** — c\n\n## Process vertical\n<!-- layout: process vertical -->\n\n- **A** — a\n- **B** — b\n\n## Cycle\n<!-- layout: cycle -->\n\n- **A**\n- **B**\n- **C**\n- **D**\n\n## Pyramid\n<!-- layout: pyramid -->\n\n- **Top** — t\n- **Mid** — m\n- **Base** — b\n\n## Funnel\n<!-- layout: funnel -->\n\n- **All**\n- **Some**\n- **Few**\n\n## Tree\n<!-- layout: hierarchy -->\n\n- **Root**\n  - **L**\n    - **LL**\n    - **LR**\n  - **R**\n\n## Matrix\n<!-- layout: matrix -->\n\n- **Q1** — a\n- **Q2** — b\n- **Q3** — c\n- **Q4** — d\n\n## Venn\n<!-- layout: venn -->\n\n- **X** — x\n- **Y** — y\n- **Z** — z\n\nshared\n',
        expect: { layouts: { 0: 'process', 1: 'process', 2: 'cycle', 3: 'pyramid', 4: 'funnel', 5: 'hierarchy', 6: 'matrix', 7: 'venn' }, noWarn: true }
    },
    {
        name: 'charts',
        md: '## Column\n<!-- chart: column labels -->\n\n| Year | Sales | Costs |\n|---|---|---|\n| 2023 | 10 | 7 |\n| 2024 | 14 | 9 |\n\n## Bar stacked\n<!-- chart: bar stacked -->\n\n| Team | A | B |\n|---|---|---|\n| X | 1 | 2 |\n| Y | 3 | 4 |\n\n## Line\n<!-- chart: line -->\n\n| M | V |\n|---|---|\n| Jan | 1 |\n| Feb | 3 |\n\n## Pie\n<!-- chart: pie -->\n\n| Part | Share |\n|---|---|\n| a | 60% |\n| b | 40% |\n\n## Doughnut beside text\n<!-- chart: doughnut -->\n\n| K | V |\n|---|---|\n| a | 1,200 |\n| b | ۳۰۰ |\n\n- **Note** — numbers in any digits\n\n## Area\n<!-- chart: area -->\n\n| X | Y |\n|---|---|\n| 1 | 2 |\n| 2 | 5 |\n',
        expect: { charts: 6, layouts: { 0: 'chart', 4: 'image' }, noWarn: true }
    },
    {
        name: 'chart-errors',
        md: '## No table\n<!-- chart: column -->\n\nJust text.\n\n## Bad type\n<!-- chart: sunburst -->\n\n| a | b |\n|---|---|\n| x | 1 |\n\n## No numbers\n<!-- chart: column -->\n\n| a | b |\n|---|---|\n| x | y |\n',
        expect: { warn: ['chart-table', 'chart-type', 'chart-data'] }
    },
    {
        name: 'table-and-split',
        md: '## Big table\n\n| # | Name |\n|---|---|\n' + Array.from({ length: 14 }, function (_, i) { return '| ' + (i + 1) + ' | Row ' + (i + 1) + ' |'; }).join('\n') +
            '\n\n## Long list\n\n' + Array.from({ length: 12 }, function (_, i) { return '- Item ' + (i + 1); }).join('\n') + '\n',
        expect: { slides: 4, text: ['(continued)', 'Row 14', 'Item 12'] }
    },
    {
        name: 'no-split-setting',
        md: '## Long list\n\n' + Array.from({ length: 12 }, function (_, i) { return '- Item ' + (i + 1); }).join('\n') + '\n',
        config: { slides: { split: false } },
        expect: { slides: 1, warn: ['bullets'] }
    },
    {
        name: 'alerts',
        md: '## Notes\n\n- point\n\n> [!NOTE]\n> a note\n\n## Two\n\n> [!TIP]\n> one\n\n> [!CAUTION]\n> two\n',
        expect: { warn: ['alerts'], text: ['a note'] }
    },
    {
        name: 'directives',
        md: '## Hidden\n<!-- slide: hidden -->\n\ntext\n\n## Dark\n<!-- slide: bg=dark number=off -->\n\ntext\n\n## Typo\n<!-- layot: cards -->\n\n- a\n\n## Unknown layout\n<!-- layout: spiral -->\n\n- a\n',
        expect: { hidden: 1, warn: ['directive', 'layout'] }
    },
    {
        name: 'notes-everywhere',
        md: '<!-- before the first slide -->\n\n## One\n\ntext <!-- inline note --> more\n\n<!--\nmulti\nline\n-->\n\n## Two\n\n- item <!-- in a list -->\n',
        expect: { notes: 2, slides: 2 }
    },
    {
        name: 'image-side-and-full',
        md: '## Side\n\n- a\n- b\n\n![a picture](placeholder)\n\n## Full\n\n![only a picture](placeholder)\n\n## Data image\n\n![dot](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==)\n',
        expect: { layouts: { 0: 'image', 1: 'image', 2: 'image' }, noWarn: true }
    },
    {
        name: 'missing-image',
        md: '## Missing\n\n![nothing](no-such-file-here.png)\n',
        expect: { warn: ['image'] }
    },
    {
        name: 'code-and-math',
        md: '## Code\n\n```js\nconst a = 1;   // a comment\nconsole.log(a);\n```\n\n## Formula\n\n$$E = mc^2$$\n\nAnd inline $a^2$ in text.\n',
        expect: { noWarn: true, text: ['console', 'js'], eqs: 2, xml: ['mc:AlternateContent', 'name="Kelk equation 0"'] }
    },
    {
        name: 'equations-fallback',
        md: '## Chemistry\n\nWater: $\\ce{H2O}$ in text.\n',
        expect: { warn: ['math-inline'], text: ['\\ce{H2O}'] }
    },
    {
        name: 'bidi-parens-dashes',
        md: '## پرانتز و خط تیره\n\n- **یادگیری ماشین (ML)**\n- کِلک (Kelk)\n- فارسی — English\n- فارسی - 2024 و فارسی – 2025\n- English — فارسی\n\n<!-- یادداشت (Notes) — پایان -->\n',
        expect: { notesRtl: true, runs: ['ML', 'Kelk', 'English', '2024', '2025'],
                  xml: ['lang="fa-IR"[^>]*>(?:(?!</a:rPr>)[\\s\\S])*<a:rtl val="1"/></a:rPr><a:t>\\)</a:t>', '<a:rtl val="0"/></a:rPr><a:t>Kelk</a:t>'] }
    },
    {
        name: 'brand-front-matter',
        md: '---\ntagline: Write less, show more\nclassification: Internal\ncontact: hello@example.com\nbullet: check\ndecoration: steps\nlogo: data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMDAgODAiPjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iODAiIHJ4PSIxNiIgZmlsbD0iIzFmNmY1YyIvPjwvc3ZnPg==\n---\n\n# Deck\n\n## One\n\n- a\n  - b\n\n# Thanks\n',
        expect: { slides: 3, noWarn: true, text: ['Write less, show more', 'Internal', 'hello@example.com'], xml: ['<a:buChar char="&#x2713;"/>', 'Segoe UI Symbol'] }
    },
    {
        name: 'statement-with-chart',
        md: '## Dashboard\n<!-- layout: statement -->\n\nScores from 1 to 5.\n\n<!-- chart: radar -->\n| a | b |\n|---|---|\n| x | 3 |\n| y | 4 |\n| z | 2 |\n',
        expect: { warn: ['layout-content'], charts: 1 }
    },
    {
        name: 'fonts-from-word-settings',
        md: '## فارسی\n\n- متن\n',
        config: { fonts: { bidi: 'B Nazanin', latin: 'Calibri', code: 'Consolas' } },
        expect: { xml: ['typeface="B Nazanin"'] }
    },
    {
        name: 'title-logo-presenter-sections',
        md: '---\npresenter: Kelk\ndate: 2026\n---\n\n# Deck\n\n![Logo](data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMDAgODAiPjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iODAiIHJ4PSIxNiIgZmlsbD0iIzFmNmY1YyIvPjwvc3ZnPg==)\n\nA subtitle\n\n## One\n\n- a\n\n# Part\n\n## Two\n\n- b\n\n# Thanks\n',
        expect: { slides: 5, noWarn: true, sections: 3, text: ['Presenter: Kelk', '2026'], xml: ['<p:pic>'] }
    },
    {
        name: 'mixed-scripts',
        md: '## مخلوط Mixed\n\n- متن فارسی با English words و 123 عدد\n- English line in an RTL deck\n- خط عربی: مرحبا بالعالم\n\n| ستون | Column |\n|---|---|\n| فارسی | English |\n',
        expect: { dir: 'rtl', text: ['English words', 'مرحبا'] }
    },
    {
        name: 'sizes-and-themes',
        md: '# T\n\n## S\n\n- a\n',
        config: { slides: { theme: 'graphite', size: 'large', titleStyle: 'light', numbers: false, primary: '#aa3300' } },
        expect: { slides: 2, noWarn: true }
    }
];
if (typeof module !== 'undefined') module.exports = SLIDES_CORPUS;
