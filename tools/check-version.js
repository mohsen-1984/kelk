/**
 * Check that every place stating Kelk's version agrees with the single source,
 * K.config.version in scripts/config.js (e.g. '2.0-rc1').
 * Run with Node (CI runs it too):  node tools/check-version.js   (npm run check:version)
 * One line per check; exit 1 on a mismatch or when a listed string is not found (moved or renamed).
 *
 * Forms derived from the version '2.0-rc1':
 *   full     2.0-rc1     the app, the creator written into exports, CHANGELOG's newest heading
 *   semver   2.0.0-rc1   package.json (npm needs major.minor.patch)
 *   release  2.0         lib/ file headers and engine versions, the download zip in README —
 *                        they name the release they belong to, so an rc does not change them
 * Deliberately not checked: PdfImporter's own version (1.0, fixed below: its first release, its own
 * numbering); "new in 2.0" in docs/about-kelk-and-samples.* and TODO.md (history, stays at 2.0);
 * CHANGELOG's older headings and body; o:Version 16.00 (Word) in msOfficeWordHtmlTemplate.js,
 * MIME-Version 1.0 in WordHtmlBuilder.js; sample data ("Version 1.2" in config.js, sample tables);
 * the version lines of .claude/skills/*; third-party versions (vendor/, fonts, THIRD-PARTY-NOTICES.md).
 */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const read = function (f) { return fs.readFileSync(path.join(root, f), 'utf8'); };

const src = /^\s*version:\s*'([^']+)'/m.exec(read('scripts/config.js'));
const parts = src && /^(\d+)\.(\d+)(-[0-9A-Za-z.]+)?$/.exec(src[1]);
if (!parts) {
    console.log('MISSING   scripts/config.js: no version: \'<major>.<minor>[-pre]\' line');
    process.exit(1);
}
const FORMS = {
    full: src[1],
    semver: parts[1] + '.' + parts[2] + '.0' + (parts[3] || ''),
    release: parts[1] + '.' + parts[2]
};

// {file, re (group 1 = the version; g = every match is checked), form or fixed, why[, count = matches expected]}
const HEADER = / \* Version: (\S+)$/gm;
const CHECKS = [
    { file: 'package.json', re: /^ {2}"version": "([^"]+)"/m, form: 'semver', why: 'npm package version' },
    { file: 'CHANGELOG.md', re: /^## \[(?!Unreleased\])([^\]]+)\]/m, form: 'full', why: 'newest release heading ([Unreleased] above it is fine)' },
    { file: 'lib/BuilderBase.js', re: /BuilderBase\.version = '([^']+)'/g, form: 'full', why: 'default creator "Kelk <version>" outside the app (Node, lab)' },
    { file: 'lib/README.md', re: /`BuilderBase\.version` \(([^ ]+) now\)/g, form: 'full', why: 'the creator, documented' },
    { file: 'README.md', re: /kelk_([0-9][^/\s)]*?)\.zip/g, form: 'release', why: 'the release download', count: 12 },
    { file: 'lib/BidiCore.js', re: HEADER, form: 'release', why: 'library header' },
    { file: 'lib/BidiView.js', re: HEADER, form: 'release', why: 'library header' },
    { file: 'lib/BidiView.js', re: /var BidiView = \{ version: '([^']+)'/g, form: 'release', why: 'BidiView.version' },
    { file: 'lib/BuilderBase.js', re: HEADER, form: 'release', why: 'library header' },
    { file: 'lib/DocxBuilder.js', re: HEADER, form: 'release', why: 'library header' },
    { file: 'lib/HtmlBuilder.js', re: HEADER, form: 'release', why: 'library header' },
    { file: 'lib/ImageCore.js', re: HEADER, form: 'release', why: 'library header' },
    { file: 'lib/MarkdownImporter.js', re: HEADER, form: 'release', why: 'library header' },
    { file: 'lib/MathCore.js', re: HEADER, form: 'release', why: 'library header' },
    { file: 'lib/MathCore.js', re: /const VERSION = '([^']+)'/g, form: 'release', why: 'MathCore.version' },
    { file: 'lib/msOfficeWordHtmlTemplate.js', re: HEADER, form: 'release', why: 'library header' },
    { file: 'lib/PdfBuilder.js', re: HEADER, form: 'release', why: 'library header' },
    { file: 'lib/PreviewBuilder.js', re: HEADER, form: 'release', why: 'library header' },
    { file: 'lib/WordHtmlBuilder.js', re: HEADER, form: 'release', why: 'library header' },
    { file: 'tools/bidi-lab.html', re: /<title>BiDi Lab ([^ ]+) /g, form: 'release', why: 'page title' },
    { file: 'tools/bidi-lab.html', re: HEADER, form: 'release', why: 'inlined BidiCore / BidiView headers', count: 2 },
    { file: 'tools/bidi-lab.html', re: /var BidiView = \{ version: '([^']+)'/g, form: 'release', why: 'inlined BidiView.version' },
    { file: 'lib/PdfImporter.js', re: HEADER, fixed: '1.0', why: 'PdfImporter\'s own version, not Kelk\'s (CHANGELOG 2.0: "the new PdfImporter is 1.0")' },
    { file: 'lib/PdfImporter.js', re: /PdfImporter\.VERSION = '([^']+)'/g, fixed: '1.0', why: 'PdfImporter.VERSION, as above' }
];

let bad = 0;
console.log('version ' + FORMS.full + ' (scripts/config.js) — semver ' + FORMS.semver + ', release ' + FORMS.release);
CHECKS.forEach(function (c) {
    const text = read(c.file), want = c.fixed || FORMS[c.form];
    const re = new RegExp(c.re.source, c.re.flags.indexOf('g') < 0 ? c.re.flags + 'g' : c.re.flags);
    const first = c.re.flags.indexOf('g') < 0;     // without g only the first match counts (CHANGELOG)
    let m, n = 0;
    while ((m = re.exec(text))) {
        const where = c.file + ':' + (text.slice(0, m.index).split('\n').length);
        if (m[1] === want) console.log('ok        ' + where + '  ' + m[1] + '  — ' + c.why);
        else { console.log('MISMATCH  ' + where + '  found ' + m[1] + ', expected ' + want + '  — ' + c.why); bad++; }
        n++;
        if (first) break;
    }
    if (!n) { console.log('MISSING   ' + c.file + '  ' + c.re + ' not found  — ' + c.why); bad++; }
    else if (c.count && n !== c.count) { console.log('COUNT     ' + c.file + '  ' + n + ' matches, expected ' + c.count + '  — ' + c.why); bad++; }
});
console.log(bad ? bad + ' problem(s)' : 'all ' + CHECKS.length + ' checks agree');
process.exit(bad ? 1 : 0);
