/**
 * Check the commit messages of a range against the commit rules of CLAUDE.md -> "Contributors and commits"
 * (plan P3.1). CI runs it on every pull request for base..head; .githooks/commit-msg applies the same rules
 * while committing, but a commit made without the hooks (another clone, the GitHub web editor) reaches the PR
 * unchecked.
 *
 *   node tools/check-commits.js <base> <head>        (npm run check:commits -- <base> <head>)
 *
 * Every commit of base..head (merge commits included: GitHub's and the lead's are named "Zarrabi: Merge …"):
 *   - the subject starts with "<Name>: " and some text, for a name in .claude/contributors.json — and, when the
 *     commit's author is a known contributor (by e-mail, then name, as contributelog.mjs finds them), with that
 *     contributor's name (a commit by Hasan Nejad named "Zarrabi: …" is refused, as commit-msg refuses it);
 *   - no Claude attribution: a "Co-authored-by:" line naming Claude or Anthropic, a "Generated with Claude Code"
 *     line, a "Claude-Session:" line — the lines .claude/scripts/contributelog.mjs commit-msg strips.
 * One line per commit; exit 1 when any commit breaks a rule, 2 on a usage or git error.
 * A merge commit GitHub makes inside a PR ("Update branch": "Merge branch 'main' into …") or a web upload
 * ("Add files via upload") carries no prefix and is refused: merge main into the branch locally instead.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

// The contributors, from .claude/contributors.json ({ contributors: [{ name, emails, names, … }] }).
function contributors(root) {
    const file = path.join(root || ROOT, '.claude', 'contributors.json');
    return JSON.parse(fs.readFileSync(file, 'utf8')).contributors;
}
function contributorNames(root) { return contributors(root).map(function (c) { return c.name; }); }

// The contributor name of a commit author ({ email, name }), or null when the author is not listed.
function contributorOf(author, list) {
    const email = String(author.email || '').toLowerCase(), name = String(author.name || '').toLowerCase();
    const has = function (xs, v) { return v && (xs || []).some(function (x) { return String(x).toLowerCase() === v; }); };
    const c = list.find(function (x) { return has(x.emails, email); }) || list.find(function (x) { return has(x.names, name) || has([x.name], name); });
    return c ? c.name : null;
}

// The problems of one commit message (empty = fine); expected: its author's contributor name, when known.
// Pure: no git, no files.
function checkMessage(message, names, expected) {
    const lines = String(message).replace(/\r\n?/g, '\n').split('\n');
    const subject = lines[0] || '';
    const problems = [];
    const named = names.some(function (n) { return subject.startsWith(n + ': ') && subject.slice(n.length + 2).trim(); });
    if (!named) problems.push('subject does not start with "<Name>: " for ' + names.map(function (n) { return '"' + n + '"'; }).join(' / '));
    else if (expected && !subject.startsWith(expected + ': ')) problems.push('subject names another contributor than its author ("' + expected + ': " expected)');
    lines.forEach(function (l) {
        if (/^\s*co-authored-by:/i.test(l) && /claude|anthropic/i.test(l)) problems.push('Claude co-author line: ' + l.trim());
        else if (/generated with \[?claude code/i.test(l)) problems.push('"Generated with Claude Code" line: ' + l.trim());
        else if (/^\s*claude-session:/i.test(l)) problems.push('Claude-Session line: ' + l.trim());
    });
    return problems;
}

// [{ sha, message }] of base..head, oldest first.
function commitsOf(base, head, root) {
    const r = spawnSync('git', ['log', '--reverse', '--format=%H%x00%ae%x00%an%x00%B%x1e', base + '..' + head],
        { cwd: root || ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) throw new Error('git log ' + base + '..' + head + ' failed: ' + (r.stderr || r.error || '').toString().trim());
    return r.stdout.split('\x1e').map(function (s) { return s.replace(/^\n/, ''); }).filter(Boolean).map(function (s) {
        const p = s.split('\0');
        return { sha: p[0], author: { email: p[1], name: p[2] }, message: p.slice(3).join('\0') };
    });
}

function main(argv) {
    if (argv.length !== 2) {
        console.log('usage: node tools/check-commits.js <base> <head>');
        return 2;
    }
    let list, names, commits;
    try {
        list = contributors();
        names = list.map(function (c) { return c.name; });
        commits = commitsOf(argv[0], argv[1]);
    } catch (e) {
        console.log('ERROR     ' + e.message);
        return 2;
    }
    let bad = 0;
    commits.forEach(function (c) {
        const subject = c.message.split('\n')[0];
        const problems = checkMessage(c.message, names, contributorOf(c.author, list));
        if (!problems.length) { console.log('ok        ' + c.sha.slice(0, 7) + '  ' + subject); return; }
        bad++;
        console.log('BAD       ' + c.sha.slice(0, 7) + '  ' + subject);
        problems.forEach(function (p) { console.log('            - ' + p); });
    });
    console.log(bad ? bad + ' of ' + commits.length + ' commit(s) break the commit rules (CLAUDE.md -> Contributors and commits)'
        : 'all ' + commits.length + ' commit(s) of ' + argv[0] + '..' + argv[1] + ' follow the commit rules');
    return bad ? 1 : 0;
}

module.exports = { checkMessage: checkMessage, contributorNames: contributorNames, contributorOf: contributorOf, commitsOf: commitsOf };

if (require.main === module) process.exitCode = main(process.argv.slice(2));
