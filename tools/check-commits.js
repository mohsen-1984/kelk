/**
 * Check the commit messages of a range against the commit rules of CLAUDE.md -> "Contributors and commits"
 * (plan P3.1). CI runs it on every pull request for base..head; .githooks/commit-msg applies the same rules
 * while committing, but a commit made without the hooks (another clone, the GitHub web editor) reaches the PR
 * unchecked.
 *
 *   node tools/check-commits.js <base> <head>        (npm run check:commits -- <base> <head>)
 *
 * Every commit of base..head (merge commits included: GitHub's and the lead's are named "Zarrabi: Merge …"):
 *   - the subject starts with "<Name>: " and some text, for a name in .claude/contributors.json;
 *   - no Claude attribution: a "Co-authored-by:" line naming Claude or Anthropic, a "Generated with Claude Code"
 *     line, a "Claude-Session:" line — the lines .claude/scripts/contributelog.mjs commit-msg strips.
 * One line per commit; exit 1 when any commit breaks a rule, 2 on a usage or git error.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

// The contributor names, from .claude/contributors.json ({ contributors: [{ name, … }] }).
function contributorNames(root) {
    const file = path.join(root || ROOT, '.claude', 'contributors.json');
    return JSON.parse(fs.readFileSync(file, 'utf8')).contributors.map(function (c) { return c.name; });
}

// The problems of one commit message (empty = fine). Pure: no git, no files.
function checkMessage(message, names) {
    const lines = String(message).replace(/\r\n?/g, '\n').split('\n');
    const subject = lines[0] || '';
    const problems = [];
    const named = names.some(function (n) { return subject.startsWith(n + ': ') && subject.slice(n.length + 2).trim(); });
    if (!named) problems.push('subject does not start with "<Name>: " for ' + names.map(function (n) { return '"' + n + '"'; }).join(' / '));
    lines.forEach(function (l) {
        if (/^\s*co-authored-by:/i.test(l) && /claude|anthropic/i.test(l)) problems.push('Claude co-author line: ' + l.trim());
        else if (/generated with \[?claude code/i.test(l)) problems.push('"Generated with Claude Code" line: ' + l.trim());
        else if (/^\s*claude-session:/i.test(l)) problems.push('Claude-Session line: ' + l.trim());
    });
    return problems;
}

// [{ sha, message }] of base..head, oldest first.
function commitsOf(base, head, root) {
    const r = spawnSync('git', ['log', '--reverse', '--format=%H%x00%B%x1e', base + '..' + head],
        { cwd: root || ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) throw new Error('git log ' + base + '..' + head + ' failed: ' + (r.stderr || r.error || '').toString().trim());
    return r.stdout.split('\x1e').map(function (s) { return s.replace(/^\n/, ''); }).filter(Boolean).map(function (s) {
        const i = s.indexOf('\0');
        return { sha: s.slice(0, i), message: s.slice(i + 1) };
    });
}

function main(argv) {
    if (argv.length !== 2) {
        console.log('usage: node tools/check-commits.js <base> <head>');
        return 2;
    }
    let names, commits;
    try {
        names = contributorNames();
        commits = commitsOf(argv[0], argv[1]);
    } catch (e) {
        console.log('ERROR     ' + e.message);
        return 2;
    }
    let bad = 0;
    commits.forEach(function (c) {
        const subject = c.message.split('\n')[0];
        const problems = checkMessage(c.message, names);
        if (!problems.length) { console.log('ok        ' + c.sha.slice(0, 7) + '  ' + subject); return; }
        bad++;
        console.log('BAD       ' + c.sha.slice(0, 7) + '  ' + subject);
        problems.forEach(function (p) { console.log('            - ' + p); });
    });
    console.log(bad ? bad + ' of ' + commits.length + ' commit(s) break the commit rules (CLAUDE.md -> Contributors and commits)'
        : 'all ' + commits.length + ' commit(s) of ' + argv[0] + '..' + argv[1] + ' follow the commit rules');
    return bad ? 1 : 0;
}

module.exports = { checkMessage: checkMessage, contributorNames: contributorNames, commitsOf: commitsOf };

if (require.main === module) process.exitCode = main(process.argv.slice(2));
