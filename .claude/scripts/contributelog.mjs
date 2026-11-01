#!/usr/bin/env node
// Keeps docs/ContributeLog.md and the plan files in step with the project rules (CLAUDE.md → "Automation").
//
//   fix            regenerate the generated parts of ContributeLog.md and add missing Creator lines to plans
//   check          report what fix would change and every rule a person has to act on (exit 1 if any)
//   stop-hook      Claude Code Stop hook: fix, then block the stop while a rule needs judgment
//   session-start  Claude Code SessionStart hook: point git at .githooks
//   pre-commit     git hook: ContributeLog up to date, staged, and one new Change History row by this contributor
//   commit-msg F   git hook: "<Contributor>: " prefix on the message, Claude co-author / generated-by lines removed
//   contributor    print the current contributor
//
// Generated parts sit between <!-- generated:NAME --> and <!-- /generated:NAME --> and are never edited by hand.
// Dependency-free; Node ≥ 20 (Intl with the Persian calendar).

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const git = (args, opts = {}) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 8000, ...opts }).trim();
  } catch { return null; }
};

const ROOT = git(['rev-parse', '--show-toplevel']) || process.cwd();
const LOG = 'docs/ContributeLog.md';
const PLANS = '.claude/plans';
const ARCHIVE = `${PLANS}/archive`;
const abs = p => path.join(ROOT, p);
// Files are processed with LF and written back with the line ending they had (autocrlf checkouts give CRLF).
const CRLF = new Set();
const read = p => {
  try {
    const t = fs.readFileSync(abs(p), 'utf8');
    if (t.includes('\r\n')) CRLF.add(p);
    return t.replace(/\r\n/g, '\n');
  } catch { return null; }
};
const write = (p, t) => fs.writeFileSync(abs(p), CRLF.has(p) ? t.replace(/\n/g, '\r\n') : t);
const fromGit = t => t && t.replace(/\r\n/g, '\n');

// ---------- contributors and dates

const MEMBERS = JSON.parse(read('.claude/contributors.json') || '{"contributors":[]}').contributors;
const NAMES = MEMBERS.map(m => m.name);

function contributor() {
  const email = (git(['config', 'user.email']) || '').toLowerCase();
  const uname = git(['config', 'user.name']) || '';
  // GitHub's private noreply address (<id>+<login>@users.noreply.github.com) is used by web merges and cloud sessions.
  const noreply = (email.match(/^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/) || [])[1];
  let m = MEMBERS.find(c => c.emails.some(e => e.toLowerCase() === email))
       || MEMBERS.find(c => noreply && c.github.toLowerCase() === noreply)
       || MEMBERS.find(c => c.names.includes(uname) || c.name === uname);
  if (!m) {
    const out = git(['credential', 'fill'], {
      input: 'protocol=https\nhost=github.com\n\n',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
    }) || '';
    const gh = (out.match(/^username=(.+)$/m) || [])[1];
    m = MEMBERS.find(c => c.github === gh);
  }
  return m ? m.name : null;
}

function shamsiToday() {
  const parts = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', {
    timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const get = t => parts.find(p => p.type === t).value.replace(/\D/g, '');
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// ---------- plans

const PLAN_NAME = /^[A-Z][A-Za-z0-9]*(?:-[A-Za-z0-9.]+)*\.md$/;
const CREATOR = /^\*\*Creator:\*\*\s*(.+?)\s*·\s*\*\*Created:\*\*\s*(\d{4}-\d{2}-\d{2})\s*$/m;

function listPlans() {
  const ls = d => { try { return fs.readdirSync(abs(d)).filter(f => f.endsWith('.md')).map(f => `${d}/${f}`); } catch { return []; } };
  return [...ls(PLANS).map(f => ({ file: f, archived: false })), ...ls(ARCHIVE).map(f => ({ file: f, archived: true }))];
}

function parsePlan({ file, archived }) {
  const text = read(file) || '';
  const head = text.split('\n').slice(0, 20).join('\n');
  const title = (text.match(/^# (.+)$/m) || [])[1];
  const cr = text.match(CREATOR);
  const summary = (text.match(/^\*\*Summary:\*\*\s*(.+)$/m) || [])[1];
  const status = (head.match(/^\*\*Status:\s*(.+?)\*\*/m) || [])[1];
  const group = archived || /^COMPLETE/i.test(status || '') ? 'completed'
              : /^PROPOSED/i.test(status || '') ? 'proposed' : 'active';
  return { file, archived, text, title, creator: cr?.[1], created: cr?.[2], summary, status, group };
}

// Adds the Creator line to plans that lack one; returns [changes, problems].
function fixPlans(who, today) {
  const changes = [], problems = [];
  for (const p of listPlans()) {
    const plan = parsePlan(p);
    const base = path.basename(p.file);
    if (!plan.title) { problems.push(`${p.file}: no "# Title" line.`); continue; }
    if (!plan.creator) {
      if (!who) problems.push(`${p.file}: no Creator line and the current contributor is unknown (see .claude/contributors.json).`);
      else {
        const text = plan.text.replace(/^(# .+\n)/m, `$1\n**Creator:** ${who} · **Created:** ${today}\n`);
        write(p.file, text);
        changes.push(`${p.file}: Creator line added (${who}, ${today})`);
      }
    } else if (!NAMES.includes(plan.creator)) {
      problems.push(`${p.file}: Creator "${plan.creator}" is not one of ${NAMES.join(' / ')}.`);
    }
    if (!p.archived && !PLAN_NAME.test(base))
      problems.push(`${p.file}: rename it to a descriptive Title-Case name such as "Kelk-<Topic>.md" (git mv) and repoint links to it.`);
    if (!plan.summary)
      problems.push(`${p.file}: add a "**Summary:** …" line under the Creator line — one paragraph: why the plan exists, what it does, what is next.`);
  }
  return [changes, problems];
}

// ---------- ContributeLog.md

const esc = s => String(s).replace(/\|/g, '\\|');
const cells = row => row.split(/(?<!\\)\|/).slice(1, -1).map(c => c.trim());

function renderPlans() {
  const plans = listPlans().map(parsePlan).sort((a, b) => (a.created || '').localeCompare(b.created || ''));
  const groups = [
    ['active', '🚧 Active', 'No plan is in progress.', true],
    ['proposed', '🗓️ Proposed — not started', 'No plan file is waiting.', false],
    ['completed', '✅ Completed', 'No plan has been completed yet.', false],
  ];
  const out = [];
  for (const [key, label, empty, open] of groups) {
    const rows = plans.filter(p => p.group === key);
    const where = key === 'completed' ? ' — <code>.claude/plans/archive/</code>' : '';
    out.push(`<details${open ? ' open' : ''}>`, `<summary><strong>${label}</strong> (${rows.length})${where}</summary>`, '');
    if (!rows.length) out.push(empty);
    else {
      out.push('| Date | Plan | Creator | Why & What |', '|---|---|---|---|');
      for (const p of rows) {
        const why = [p.status && `**Status:** ${p.status.replace(/\.$/, '')}.`, p.summary].filter(Boolean).join(' ');
        out.push(`| ${p.created || '—'} | [${esc(p.title)}](../${p.file}) | ${p.creator || '—'} | ${esc(why)} |`);
      }
    }
    out.push('', '</details>', '');
  }
  return out.join('\n').trimEnd();
}

function historyRows(text) {
  const start = text.indexOf('## 📜 Change History');
  if (start < 0) return null;
  const end = text.indexOf('\n## ', start + 5);
  return text.slice(start, end < 0 ? undefined : end).split('\n').filter(l => /^\| \d{4}-\d{2}-\d{2}/.test(l)).map(cells);
}

function renderTotals(rows) {
  const per = Object.fromEntries(NAMES.map(n => [n, { min: 0, rows: 0, measured: 0 }]));
  let total = 0, unmeasured = 0;
  for (const [, , who, wl] of rows) {
    const t = per[who] || (per[who] = { min: 0, rows: 0, measured: 0 });
    t.rows++;
    if (/^\d+$/.test(wl)) { t.min += +wl; t.measured++; total += +wl; } else unmeasured++;
  }
  const parts = Object.entries(per).filter(([, t]) => t.rows).map(([n, t]) =>
    t.measured ? `${n} ${t.min} min (${t.rows} rows)` : `${n} — (${t.rows} rows, no logs)`);
  return `**Entries: ${rows.length} · Total: ${total} min (${(total / 60).toFixed(2)} hours) — ${parts.join(', ')}.**`
       + (unmeasured ? ` (${unmeasured} rows without logs carry no figure.)` : '');
}

function validateHistory(rows) {
  const problems = [];
  let prev = '';
  rows.forEach((c, i) => {
    const n = i + 1;
    if (c.length !== 5) { problems.push(`Change History row ${n}: ${c.length} columns, expected 5 (Date | Version | Contributor | Workload | Change).`); return; }
    const [date, , who, wl, change] = c;
    if (!/^\d{4}-\d{2}-\d{2}( → \d{4}-\d{2}-\d{2})?$/.test(date)) problems.push(`Change History row ${n}: date "${date}" is not Shamsi YYYY-MM-DD.`);
    if (!NAMES.includes(who)) problems.push(`Change History row ${n}: contributor "${who}" is not one of ${NAMES.join(' / ')}.`);
    if (!/^(\d+|—)$/.test(wl)) problems.push(`Change History row ${n}: workload "${wl}" must be whole minutes or —.`);
    if (!change) problems.push(`Change History row ${n}: empty description.`);
    const actor = change.match(/\b(the person|person['’]s|lead session|agents?|by the author|the author|the owner|owner['’]s)\b/i);
    if (actor) problems.push(`Change History row ${n}: describe only the action, not who did it ("${actor[0]}"); the Contributor column carries the name.`);
    if (date.slice(0, 10) < prev) problems.push(`Change History row ${n}: out of chronological order (${date} after ${prev}).`);
    prev = date.slice(0, 10);
  });
  return problems;
}

function replaceBlock(text, name, body) {
  const re = new RegExp(`(<!-- generated:${name} -->\\n)[\\s\\S]*?(\\n<!-- /generated:${name} -->)`);
  return re.test(text) ? text.replace(re, `$1${body}$2`) : null;
}

// Counts in "<summary>… (N)" for collapsible tables written by hand (e.g. Known Issues → Resolved).
function recount(text) {
  return text.replace(/(<summary><strong>[^<]+<\/strong> \()(\d+)(\)[^\n]*<\/summary>\n)([\s\S]*?)(<\/details>)/g,
    (all, a, _n, b, body, end) => body.includes('<!-- generated') ? all
      : `${a}${body.split('\n').filter(l => /^\| (?!Priority|Date|---)/.test(l)).length}${b}${body}${end}`);
}

// Returns { text, problems } — the regenerated ContributeLog for the given source text.
function buildLog(src) {
  const problems = [];
  let text = src;
  for (const [name, body] of [['plans', renderPlans()]]) {
    const t = replaceBlock(text, name, body);
    if (t === null) problems.push(`${LOG}: the <!-- generated:${name} --> markers are missing.`); else text = t;
  }
  const rows = historyRows(text);
  if (!rows) problems.push(`${LOG}: no "## 📜 Change History" section.`);
  else {
    problems.push(...validateHistory(rows));
    const t = replaceBlock(text, 'totals', renderTotals(rows));
    if (t === null) problems.push(`${LOG}: the <!-- generated:totals --> markers are missing.`); else text = t;
  }
  return { text: recount(text), problems };
}

// ---------- git hooks path

function ensureHooksPath() {
  if (!fs.existsSync(abs('.githooks'))) return null;
  if (git(['config', '--local', 'core.hooksPath']) === '.githooks') return null;
  git(['config', '--local', 'core.hooksPath', '.githooks']);
  return 'git core.hooksPath set to .githooks';
}

// ---------- commands

function fix() {
  const who = contributor(), today = shamsiToday();
  const [changes, problems] = fixPlans(who, today);
  const src = read(LOG);
  if (src === null) problems.push(`${LOG} is missing.`);
  else {
    const { text, problems: p } = buildLog(src);
    problems.push(...p);
    if (text !== src) { write(LOG, text); changes.push(`${LOG}: generated sections refreshed`); }
  }
  if (!who) problems.push('The current contributor is unknown: add your git email to .claude/contributors.json.');
  return { changes, problems };
}

function check() {
  const problems = [];
  const src = read(LOG);
  for (const p of listPlans()) {
    const plan = parsePlan(p);
    if (!plan.creator) problems.push(`${p.file}: no Creator line (run fix).`);
  }
  problems.push(...fixPlans(null, null)[1].filter(m => !/no Creator line/.test(m)));
  if (src === null) problems.push(`${LOG} is missing.`);
  else {
    const { text, problems: p } = buildLog(src);
    problems.push(...p);
    if (text !== src) problems.push(`${LOG}: generated sections are out of date — run: node .claude/scripts/contributelog.mjs fix`);
  }
  return problems;
}

function stopHook() {
  let input = {};
  try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch {}
  const hp = ensureHooksPath();
  const { changes, problems } = fix();
  if (hp) changes.unshift(hp);
  const note = changes.length ? `ContributeLog automation: ${changes.join('; ')}.` : '';
  if (problems.length && input.permission_mode !== 'plan' && !input.stop_hook_active) {
    const reason = `Project rules (CLAUDE.md → Automation) need action before stopping:\n- ${problems.join('\n- ')}`
                 + (note ? `\n(${note})` : '');
    process.stdout.write(JSON.stringify({ decision: 'block', reason }));
    return;
  }
  const msg = [note, problems.length ? `Still open: ${problems.join(' ')}` : ''].filter(Boolean).join(' ');
  if (msg) process.stdout.write(JSON.stringify({ systemMessage: msg }));
}

function preCommit() {
  const fail = msg => { process.stderr.write(`\n✖ pre-commit (CLAUDE.md → Automation): ${msg}\n\n`); process.exit(1); };
  const problems = check();
  if (problems.length) fail(`\n- ${problems.join('\n- ')}`);
  if (git(['diff', '--quiet', '--', LOG]) === null) fail(`${LOG} has unstaged changes — stage it (git add ${LOG}).`);
  if (fs.existsSync(abs('.git/MERGE_HEAD'))) return;
  // Work on the log itself is not recorded (workload rule 1): a commit touching only these files needs no row.
  const LEDGER = new Set([LOG, '.claude/scripts/contributelog.mjs', '.claude/scripts/workload.mjs', '.claude/contributors.json']);
  const files = (git(['diff', '--cached', '--name-only']) || '').split('\n').filter(Boolean);
  if (files.every(f => LEDGER.has(f))) return;
  const staged = historyRows(fromGit(git(['show', `:${LOG}`])) || '') || [];
  const before = historyRows(fromGit(git(['show', `HEAD:${LOG}`])) || '') || [];
  const who = contributor();
  if (!who) fail('the current contributor is unknown — add your git email to .claude/contributors.json.');
  // A new row is one not in HEAD and dated on or after HEAD's newest row (reworded old rows don't count).
  const old = new Set(before.map(c => c.join('|')));
  const newest = before.reduce((m, c) => (c[0].slice(0, 10) > m ? c[0].slice(0, 10) : m), '');
  const added = staged.filter(c => !old.has(c.join('|')) && c[0].slice(0, 10) >= newest);
  if (!added.some(c => c[2] === who))
    fail(`a commit that changes the project adds its Change History row(s) to ${LOG}, at least one with Contributor "${who}". `
       + 'Measure the change with: node .claude/scripts/workload.mjs');
}

function commitMsg(file) {
  const who = contributor();
  const lines = fs.readFileSync(file, 'utf8').split('\n')
    .filter(l => !(/^\s*co-authored-by:/i.test(l) && /claude|anthropic/i.test(l)))
    .filter(l => !/generated with \[?claude code/i.test(l))
    .filter(l => !/^\s*claude-session:/i.test(l));
  while (lines.length && !lines.at(-1).trim()) lines.pop();
  const i = lines.findIndex(l => l.trim() && !l.startsWith('#'));
  if (i < 0) return fs.writeFileSync(file, lines.join('\n') + '\n');
  const named = NAMES.find(n => lines[i].startsWith(`${n}: `));
  if (named && who && named !== who) {
    process.stderr.write(`\n✖ commit-msg: the message names "${named}" but this commit is made by "${who}".\n\n`);
    process.exit(1);
  }
  if (!named) {
    if (!who) { process.stderr.write('\n✖ commit-msg: unknown contributor — add your git email to .claude/contributors.json.\n\n'); process.exit(1); }
    lines[i] = `${who}: ${lines[i]}`;
  }
  fs.writeFileSync(file, lines.join('\n') + '\n');
}

const [cmd, arg] = process.argv.slice(2).map(a => a.trim());
switch (cmd) {
  case 'fix': {
    const { changes, problems } = fix();
    for (const c of changes) console.log(`fixed: ${c}`);
    for (const p of problems) console.log(`TODO:  ${p}`);
    process.exitCode = problems.length ? 1 : 0;
    break;
  }
  case 'check': {
    const problems = check();
    for (const p of problems) console.log(`TODO:  ${p}`);
    if (!problems.length) console.log('ContributeLog and plans: OK');
    process.exitCode = problems.length ? 1 : 0;
    break;
  }
  case 'stop-hook': stopHook(); break;
  case 'session-start': { const hp = ensureHooksPath(); if (hp) console.log(hp); break; }
  case 'pre-commit': preCommit(); break;
  case 'commit-msg': commitMsg(arg); break;
  case 'contributor': console.log(contributor() || 'unknown'); break;
  default:
    console.log('usage: node .claude/scripts/contributelog.mjs fix|check|stop-hook|session-start|pre-commit|commit-msg <file>|contributor');
    process.exitCode = 2;
}
