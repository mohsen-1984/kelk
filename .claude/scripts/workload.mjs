#!/usr/bin/env node
// workload.mjs — measure project workload from Claude Code session logs.
//
// Implements docs/ContributeLog.md → Change History → "How Workload is calculated", rules 6–16.
// Dependency-free (Node ESM). Reads only; never writes anything.
//
// Usage:
//   node .claude/scripts/workload.mjs                 # last commit on HEAD → now (the change about to be committed)
//   node .claude/scripts/workload.mjs --all           # whole history, split at every commit
//   node .claude/scripts/workload.mjs --since <ISO|commit-ish> [--until <ISO|commit-ish>]
//   ... --split-at <ISO>   (repeatable: extra boundaries)
//   ... --json             (same structure as JSON)
//
// AI time (rules 6–11): every log (main session log and each agent log) is measured on its own. The gaps between
// consecutive timestamped events are summed: a gap ≤ 5 min counts in full; a longer gap counts in full only when it
// ends with the result of a run the log started itself (tool_result of its own tool_use, or the completion
// notification of its own background command), never for AskUserQuestion / ExitPlanMode / Agent (waiting for a
// person or for agents is capped); any other longer gap counts 5 min. A gap crossing a segment boundary is divided at
// the boundary (a capped 5-min gap goes to the segment it starts in). A fork / resumed copy counts only its own
// events (events whose uuid already appears in an earlier log, and anything before its first own event, are dropped).
//
// Human time (rules 12–14, PROPOSED): from the end of an assistant turn (last assistant event of any main log before
// the person's response, and after the previous person response) to the person's next genuine message, or from an
// AskUserQuestion / ExitPlanMode call to its answer. Minus any part during which an agent log had events (first→last
// event) or a background run was in flight (run_in_background tool_use → its completion notification, or the end of
// the log if none). Capped at 15 min per interval (a capped interval that crosses a boundary is scaled
// proportionally). Skipped: messages that arrived while the session was still running a tool of its own (queued),
// and turns that ended with an API / usage-limit error.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const MIN = 60000;
const GAP_FULL = 5 * MIN;
const HUMAN_CAP = 15 * MIN;
const NONRUN = new Set(["AskUserQuestion", "ExitPlanMode", "Agent", "Task"]);
const PERSON_TOOLS = new Set(["AskUserQuestion", "ExitPlanMode"]);
const FINAL_STATUS = /^(completed|failed|killed|error|stopped|cancelled|canceled|timeout|timed_out)$/i;

// ---------------------------------------------------------------- arguments
function usage(msg) {
  if (msg) process.stderr.write(`workload: ${msg}\n`);
  process.stderr.write(
    "usage: node .claude/scripts/workload.mjs [--all | --since <ISO|commit-ish>] [--until <ISO|commit-ish>]\n" +
    "                                          [--split-at <ISO>]... [--json]\n");
  process.exit(2);
}
const opts = { all: false, since: null, until: null, splitAt: [], json: false };
{
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    const val = () => { if (i + 1 >= a.length) usage(`${k} needs a value`); return a[++i]; };
    if (k === "--all") opts.all = true;
    else if (k === "--json") opts.json = true;
    else if (k === "--since") opts.since = val();
    else if (k === "--until") opts.until = val();
    else if (k === "--split-at") opts.splitAt.push(val());
    else if (k === "-h" || k === "--help") usage();
    else usage(`unknown argument ${k}`);
  }
  if (opts.all && opts.since) usage("--all and --since are mutually exclusive");
}

// ---------------------------------------------------------------- git
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
function git(args, cwd) {
  try { return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return null; }
}
const repoRoot = git(["rev-parse", "--show-toplevel"], scriptDir) || git(["rev-parse", "--show-toplevel"], process.cwd())
  || path.resolve(scriptDir, "..", "..");
const commits = (git(["log", "--all", "--format=%H %cI %s"], repoRoot) || "").split("\n").filter(Boolean).map(l => {
  const m = l.match(/^(\S+) (\S+) ?(.*)$/);
  return { hash: m[1], t: Date.parse(m[2]), subject: m[3] };
}).sort((x, y) => x.t - y.t);

function resolveTime(s, what) {
  if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?(Z|[+-]\d{2}:?\d{2})?$/.test(s)) {
    const t = Date.parse(s.replace(" ", "T"));
    if (!Number.isNaN(t)) return t;
  }
  const iso = git(["log", "-1", "--format=%cI", s, "--"], repoRoot);
  if (iso) return Date.parse(iso);
  usage(`${what}: "${s}" is neither an ISO time nor a commit-ish`);
}

// ---------------------------------------------------------------- log discovery
const mangle = p => p.replace(/[^A-Za-z0-9]/g, "-").toLowerCase();
const projectsDir = path.join(os.homedir(), ".claude", "projects");
const want = mangle(path.resolve(repoRoot));
let projDirs = [];
try {
  projDirs = fs.readdirSync(projectsDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name.toLowerCase() === want).map(d => path.join(projectsDir, d.name));
} catch { /* no projects dir */ }

function loadLog(file) {
  let text;
  try { text = fs.readFileSync(file, "utf8"); } catch { return []; }
  const out = [];
  let n = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (!e || !e.timestamp) continue;
    const t = Date.parse(e.timestamp);
    if (Number.isNaN(t)) continue;
    e.t = t; e._i = n++;
    out.push(e);
  }
  return out.sort((a, b) => a.t - b.t || a._i - b._i);
}

const contentArr = e => (e.message && Array.isArray(e.message.content)) ? e.message.content : [];
const contentStr = e => {
  const c = e.message && e.message.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map(x => (x && x.type === "text") ? x.text : "").join("");
  return "";
};
const toolUses = e => e.type === "assistant" ? contentArr(e).filter(x => x && x.type === "tool_use") : [];
const toolResults = e => e.type === "user" ? contentArr(e).filter(x => x && x.type === "tool_result") : [];
function notification(e) {
  if (e.type !== "user") return null;
  const s = contentStr(e);
  if (!(e.origin && e.origin.kind === "task-notification") && !s.trimStart().startsWith("<task-notification>")) return null;
  const id = (s.match(/<tool-use-id>([^<]+)<\/tool-use-id>/) || [])[1];
  const status = ((s.match(/<status>([^<]+)<\/status>/) || [])[1] || "").trim();
  return { id, status };
}
function isGenuineMessage(e) {
  if (e.type !== "user" || e.isMeta || e.isSidechain) return false;
  if (toolResults(e).length) return false;
  const s = contentStr(e).trimStart();
  if (e.origin && e.origin.kind) {
    if (e.origin.kind === "human") return true;
    return false;
  }
  if (s.startsWith("<command-name>")) return true;           // a slash command the person typed
  if (!s || s.startsWith("<") || s.startsWith("[Request interrupted") || s.startsWith("Caveat:")) return false;
  return true;                                                 // older logs without `origin`
}

// Load every session, dropping copied history.
const seenUuid = new Set();
const sessions = [];
for (const dir of projDirs) {
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith(".jsonl"))) {
    const id = f.slice(0, -6);
    sessions.push({ id, dir, file: path.join(dir, f), events: loadLog(path.join(dir, f)), agents: [] });
  }
}
sessions.sort((a, b) => (a.events[0]?.t ?? Infinity) - (b.events[0]?.t ?? Infinity));
function dropCopied(events) {
  const own = events.filter(e => !e.uuid || !seenUuid.has(e.uuid));
  const firstOwn = own.find(e => e.uuid);
  // only a log that really carries copied history also loses what precedes its first own event
  const kept = firstOwn && own.length < events.length ? own.filter(e => e.t >= firstOwn.t) : own;
  return { kept, dropped: events.length - kept.length };
}
for (const s of sessions) {
  const r = dropCopied(s.events);
  s.events = r.kept; s.dropped = r.dropped;
  for (const e of s.events) if (e.uuid) seenUuid.add(e.uuid);
}
for (const s of sessions) {
  const sub = path.join(s.dir, s.id, "subagents");
  let files = [];
  try { files = fs.readdirSync(sub).filter(x => /^agent-.*\.jsonl$/.test(x)); } catch { continue; }
  const loaded = files.map(f => ({ id: f.slice(6, -6), file: path.join(sub, f), events: loadLog(path.join(sub, f)) }))
    .sort((a, b) => (a.events[0]?.t ?? Infinity) - (b.events[0]?.t ?? Infinity));
  for (const a of loaded) {
    const r = dropCopied(a.events);
    a.events = r.kept; a.dropped = r.dropped;
    for (const e of a.events) if (e.uuid) seenUuid.add(e.uuid);
    let meta = {};
    try { meta = JSON.parse(fs.readFileSync(a.file.replace(/\.jsonl$/, ".meta.json"), "utf8")); } catch { }
    a.type = meta.agentType || null;
    a.description = meta.description || null;
    const first = a.events.find(e => e.type === "user" && !toolResults(e).length);
    a.prompt = first ? contentStr(first).replace(/\s+/g, " ").trim() : "";
    if (a.events.length) s.agents.push(a);
  }
}

// ---------------------------------------------------------------- range & segments
const now = Date.now();
const lastHeadCommit = (() => { const iso = git(["log", "-1", "--format=%cI", "HEAD"], repoRoot); return iso ? Date.parse(iso) : -Infinity; })();
const since = opts.all ? -Infinity : opts.since ? resolveTime(opts.since, "--since") : lastHeadCommit;
const until = opts.until ? resolveTime(opts.until, "--until") : now;
if (!(until > since)) usage("--until must be later than --since");
const splitTimes = opts.splitAt.map(s => resolveTime(s, "--split-at"));

const inner = new Map(); // t -> {commits:[], split:bool}
for (const c of commits) if (c.t > since && c.t < until) {
  if (!inner.has(c.t)) inner.set(c.t, { commits: [], split: false });
  inner.get(c.t).commits.push(c);
}
for (const t of splitTimes) if (t > since && t < until) {
  if (!inner.has(t)) inner.set(t, { commits: [], split: false });
  inner.get(t).split = true;
}
const points = [since, ...[...inner.keys()].sort((a, b) => a - b), until];
const nSeg = points.length - 1;
const bounds = points.slice(1, -1);
// segment index of time t (−1 = before range, nSeg = after range)
const segOf = t => {
  if (t < since) return -1;
  if (t >= until) return nSeg;
  let k = 0; for (const b of bounds) if (t >= b) k++; return k;
};
// distribute [a,b) over segments (only inside the range)
function spread(a, b, addFn) {
  let x = Math.max(a, since);
  const end = Math.min(b, until);
  if (end <= x) return;
  for (const bd of bounds) if (bd > x && bd < end) { addFn(segOf(x), bd - x); x = bd; }
  addFn(segOf(x), end - x);
}
const endCommitOf = k => {
  const p = points[k + 1];
  const inf = inner.get(p);
  if (inf && inf.commits.length) return inf.commits;
  const c = commits.find(c => c.t === p);
  return c ? [c] : [];
};
function segLabel(k) {
  const p = points[k + 1];
  const cs = endCommitOf(k);
  if (cs.length) return cs.map(c => `${c.hash.slice(0, 7)} ${c.subject}`).join(" + ");
  const inf = inner.get(p);
  if (inf && inf.split) return `split at ${fmt(p)}`;
  if (k === nSeg - 1 && !opts.until) return "uncommitted";
  return `until ${fmt(p)}`;
}

// ---------------------------------------------------------------- formatting
const pad = n => String(n).padStart(2, "0");
function fmt(t) {
  if (!Number.isFinite(t)) return t < 0 ? "-inf" : "+inf";
  const d = new Date(t);
  const off = -d.getTimezoneOffset(), sg = off >= 0 ? "+" : "-", ao = Math.abs(off);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sg}${pad(Math.floor(ao / 60))}:${pad(ao % 60)}`;
}
const fmtShort = t => fmt(t).slice(0, 19).replace("T", " ");
const shamsiFmt = (() => {
  try { return new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", { year: "numeric", month: "2-digit", day: "2-digit" }); }
  catch { return null; }
})();
function shamsi(t) {
  if (!shamsiFmt || !Number.isFinite(t)) return null;
  const p = Object.fromEntries(shamsiFmt.formatToParts(new Date(t)).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
const r2 = ms => Math.round(ms / MIN * 100) / 100;

// ---------------------------------------------------------------- AI measurement (rules 6–11)
function measure(events) {
  const per = new Array(nSeg).fill(0);
  const span = new Array(nSeg).fill(null);
  const longs = [];
  const pending = new Map();   // tool_use id -> {name, bg}
  const bgPending = new Map(); // background runs started by this log, waiting for a completion notification
  const touch = (k, t) => { if (k < 0 || k >= nSeg) return; const s = span[k] || (span[k] = [t, t]); s[0] = Math.min(s[0], t); s[1] = Math.max(s[1], t); };
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (i > 0) {
      const a = events[i - 1].t, b = e.t, g = b - a;
      let full = g <= GAP_FULL, why = "";
      if (!full) {
        const res = toolResults(e).map(x => x.tool_use_id);
        const own = res.map(id => pending.get(id)).find(v => v && !NONRUN.has(v.name));
        const n = notification(e);
        const bg = n && n.id && bgPending.get(n.id);
        if (own) { full = true; why = `own run ${own.name} -> its result`; }
        else if (bg && !NONRUN.has(bg.name) && FINAL_STATUS.test(n.status || "completed")) { full = true; why = `own background run ${bg.name} -> its completion`; }
        else {
          const names = [...pending.values()].map(v => v.name);
          why = names.some(n => PERSON_TOOLS.has(n)) ? "waiting for the person (question/plan)"
            : names.includes("Agent") || names.includes("Task") || (n && n.id) ? "waiting for agents / background notice"
            : "no own run returning (person, idle, stall)";
        }
        if (b > since && a < until) longs.push({ from: fmt(a), to: fmt(b), gap: r2(g), counted: full ? r2(g) : 5, why });
      }
      if (full) spread(a, b, (k, ms) => { if (k >= 0 && k < nSeg) per[k] += ms; });
      else { const k = segOf(a); if (k >= 0 && k < nSeg) per[k] += GAP_FULL; }
      if (full || segOf(a) === segOf(b)) touch(segOf(b), b);
      touch(segOf(a), a);
    }
    for (const u of toolUses(e)) pending.set(u.id, { name: u.name, bg: !!(u.input && u.input.run_in_background), t: e.t });
    for (const r of toolResults(e)) {
      const p = pending.get(r.tool_use_id);
      if (p && p.bg) bgPending.set(r.tool_use_id, p);
      pending.delete(r.tool_use_id);
    }
    const n = notification(e);
    if (n && n.id && FINAL_STATUS.test(n.status || "completed")) bgPending.delete(n.id);
  }
  return { per, span, longs };
}

// ---------------------------------------------------------------- human measurement (rules 12–14)
// Busy intervals: agent logs (first→last event) and background runs (tool_use → completion notification).
const busy = [];
for (const s of sessions) {
  for (const a of s.agents) busy.push([a.events[0].t, a.events.at(-1).t, `agent ${a.id.slice(0, 8)}`]);
  const started = new Map();
  for (const e of s.events) {
    for (const u of toolUses(e)) if (u.input && u.input.run_in_background) started.set(u.id, { t: e.t, name: u.name });
    const n = notification(e);
    if (n && n.id && started.has(n.id)) {
      const st = started.get(n.id);
      if (FINAL_STATUS.test(n.status || "completed")) { busy.push([st.t, e.t, `background ${st.name} ${n.id.slice(-6)}`]); started.delete(n.id); }
    }
  }
  const end = s.events.at(-1)?.t;
  for (const [id, st] of started) busy.push([st.t, end, `background ${st.name} ${id.slice(-6)} (no completion seen)`]);
}
busy.sort((a, b) => a[0] - b[0]);
// free sub-intervals of [a,b) not covered by busy
function freeParts(a, b) {
  let parts = [[a, b]];
  for (const [s, e] of busy) {
    if (e <= a || s >= b) continue;
    const next = [];
    for (const [x, y] of parts) {
      if (e <= x || s >= y) { next.push([x, y]); continue; }
      if (s > x) next.push([x, s]);
      if (e < y) next.push([e, y]);
    }
    parts = next;
  }
  return parts;
}

function humanIntervals() {
  // global timeline of the main logs
  const tl = [];
  for (const s of sessions) for (const e of s.events) if (!e.isSidechain) tl.push({ e, s });
  tl.sort((x, y) => x.e.t - y.e.t || x.e._i - y.e._i);
  // result time of every tool_use (to detect messages queued while a tool of the session was running)
  const resultAt = new Map();
  for (const { e } of tl) for (const r of toolResults(e)) if (!resultAt.has(r.tool_use_id)) resultAt.set(r.tool_use_id, e.t);
  const out = [];
  let lastAssistant = null, lastPerson = -Infinity;
  const pendingBySession = new Map();
  const personTool = new Map(); // tool_use id -> {t, name}
  for (const { e, s } of tl) {
    if (e.type === "assistant") {
      lastAssistant = e;
      if (!pendingBySession.has(s.id)) pendingBySession.set(s.id, new Map());
      for (const u of toolUses(e)) {
        if (PERSON_TOOLS.has(u.name)) personTool.set(u.id, { t: e.t, name: u.name, s });
        else if (!(u.input && u.input.run_in_background)) pendingBySession.get(s.id).set(u.id, e.t);
      }
      continue;
    }
    for (const r of toolResults(e)) {
      pendingBySession.get(s.id)?.delete(r.tool_use_id);
      const q = personTool.get(r.tool_use_id);
      if (q) {
        out.push({ kind: q.name, session: s.id, from: q.t, to: e.t });
        lastPerson = e.t; personTool.delete(r.tool_use_id);
      }
    }
    if (!isGenuineMessage(e)) continue;
    const m = e.t;
    const queued = [...(pendingBySession.get(s.id)?.entries() || [])].some(([id]) => (resultAt.get(id) ?? -Infinity) > m);
    const errTurn = lastAssistant && (lastAssistant.isApiErrorMessage || lastAssistant.error);
    if (lastAssistant && lastAssistant.t >= lastPerson && lastAssistant.t < m && !queued && !errTurn) {
      out.push({ kind: "message", session: s.id, from: lastAssistant.t, to: m, text: contentStr(e).replace(/\s+/g, " ").trim().slice(0, 60) });
    }
    lastPerson = m;
    pendingBySession.set(s.id, new Map());
  }
  // subtract busy time, cap, split at boundaries
  const per = new Array(nSeg).fill(0);
  const list = [];
  for (const iv of out) {
    if (iv.to <= since || iv.from >= until) continue;
    const pieces = new Array(nSeg).fill(0);
    let free = 0;
    for (const [x, y] of freeParts(iv.from, iv.to)) spread(x, y, (k, ms) => { if (k >= 0 && k < nSeg) { pieces[k] += ms; free += ms; } });
    let inRange = 0; spread(iv.from, iv.to, (k, ms) => { inRange += ms; });
    const raw = iv.to - iv.from;
    const capped = Math.min(free, HUMAN_CAP);
    const scale = free > 0 ? capped / free : 0;
    const segs = [];
    pieces.forEach((ms, k) => {
      per[k] += ms * scale;
      // list the interval under a segment only when it contributes there (sub-second slivers left by a boundary
      // given without milliseconds are not listed), or — when fully overlapped — under the segment it ends in
      const listed = r2(ms * scale) > 0 || (free === 0 && k === segOf(Math.min(iv.to, until - 1)));
      if (listed) segs.push({ segment: k, minutes: r2(ms * scale) });
    });
    list.push({
      kind: iv.kind, session: iv.session.slice(0, 8), from: fmt(iv.from), to: fmt(iv.to),
      raw: r2(raw), afterOverlap: r2(free), counted: r2(capped), segments: segs,
      note: free < inRange - 500 ? "AI work running during part of it (subtracted)" : raw > HUMAN_CAP && capped === HUMAN_CAP ? "capped at 15" : undefined,
      ...(iv.text ? { message: iv.text } : {}),
    });
  }
  return { per, list };
}

// ---------------------------------------------------------------- assemble
const segs = Array.from({ length: nSeg }, (_, k) => ({
  index: k, label: segLabel(k), from: fmt(points[k]), to: fmt(points[k + 1]),
  endCommit: endCommitOf(k).map(c => c.hash.slice(0, 7)), rows: [], span: null, longGaps: [],
}));
const widen = (k, sp) => { if (!sp) return; const s = segs[k]; s.span = s.span ? [Math.min(s.span[0], sp[0]), Math.max(s.span[1], sp[1])] : [...sp]; };
for (const s of sessions) {
  if (!s.events.length) continue;
  const m = measure(s.events);
  m.per.forEach((ms, k) => {
    if (ms > 0) segs[k].rows.push({ kind: "lead", id: s.id.slice(0, 8), session: s.id, minutes: r2(ms), rounded: Math.round(ms / MIN), ...(s.dropped ? { copiedEventsDropped: s.dropped } : {}) });
    widen(k, m.span[k]);
  });
  for (const g of m.longs) { const k = segOf(Date.parse(g.from)); if (k >= 0 && k < nSeg) segs[k].longGaps.push({ log: s.id.slice(0, 8), ...g }); }
  for (const a of s.agents) {
    const am = measure(a.events);
    am.per.forEach((ms, k) => {
      if (ms > 0) segs[k].rows.push({
        kind: "agent", id: a.id.slice(0, 8), agent: a.id, session: s.id.slice(0, 8), type: a.type, description: a.description,
        scope: a.prompt.slice(0, 80), minutes: r2(ms), rounded: Math.round(ms / MIN), ...(a.dropped ? { copiedEventsDropped: a.dropped } : {}),
      });
      widen(k, am.span[k]);
    });
    for (const g of am.longs) { const k = segOf(Date.parse(g.from)); if (k >= 0 && k < nSeg) segs[k].longGaps.push({ log: `agent ${a.id.slice(0, 8)}`, ...g }); }
  }
}
const human = humanIntervals();
human.per.forEach((ms, k) => {
  const ivs = human.list.filter(iv => iv.segments.some(x => x.segment === k));
  if (ms > 0 || ivs.length) segs[k].rows.push({
    kind: "person", proposed: true, minutes: r2(ms), rounded: Math.round(ms / MIN),
    intervals: ivs.map(iv => ({ ...iv, inThisSegment: iv.segments.find(x => x.segment === k).minutes, segments: undefined })),
  });
});
const sumKind = (rows, f) => Math.round(rows.filter(f).reduce((a, r) => a + r.minutes, 0) * 100) / 100;
const outSegs = segs.filter(s => s.rows.some(r => r.minutes > 0)).map(s => {
  const ai = sumKind(s.rows, r => r.kind !== "person"), hu = sumKind(s.rows, r => r.kind === "person");
  return {
    label: s.label, endCommit: s.endCommit, from: s.from, to: s.to,
    activity: s.span ? { first: fmt(s.span[0]), last: fmt(s.span[1]), shamsi: [...new Set([shamsi(s.span[0]), shamsi(s.span[1])])].join("/") } : null,
    rows: s.rows.filter(r => r.minutes > 0 || r.kind === "person"),
    totals: { rows: s.rows.filter(r => r.minutes > 0).length, ai, humanProposed: hu, overall: Math.round((ai + hu) * 100) / 100, hours: Math.round((ai + hu) / 60 * 100) / 100 },
    longGaps: s.longGaps,
  };
});
const G = outSegs.reduce((a, s) => ({ rows: a.rows + s.totals.rows, ai: a.ai + s.totals.ai, hu: a.hu + s.totals.humanProposed }), { rows: 0, ai: 0, hu: 0 });
const result = {
  repoRoot, logDirs: projDirs, range: { since: fmt(since), until: fmt(until), boundaries: bounds.map(fmt) },
  segments: outSegs,
  totals: { rows: G.rows, ai: r2(G.ai * MIN), humanProposed: r2(G.hu * MIN), overall: r2((G.ai + G.hu) * MIN), hours: Math.round((G.ai + G.hu) / 60 * 100) / 100 },
};

// ---------------------------------------------------------------- output
if (opts.json) {
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
} else {
  const L = [];
  const mm = r => `${r.minutes.toFixed(2).padStart(7)} min (${String(r.rounded).padStart(3)})`;
  L.push(`Workload — ${repoRoot}`);
  L.push(`Logs: ${projDirs.length ? projDirs.join(", ") : "(no matching ~/.claude/projects folder)"}`);
  L.push(`Range: ${fmtShort(since)} → ${fmtShort(until)}${bounds.length ? `, ${bounds.length} boundar${bounds.length === 1 ? "y" : "ies"}` : ""}`);
  if (!outSegs.length) L.push("", "No logged work in this range.");
  for (const s of outSegs) {
    L.push("", `== ${s.label}`);
    L.push(`   ${fmtShort(Date.parse(s.from))} → ${fmtShort(Date.parse(s.to))}` + (s.activity ? `   activity ${fmtShort(Date.parse(s.activity.first))} → ${fmtShort(Date.parse(s.activity.last))}   [${s.activity.shamsi}]` : ""));
    for (const r of s.rows) {
      if (r.kind === "lead") L.push(`   ${mm(r)}  lead session ${r.id}`);
      else if (r.kind === "agent") L.push(`   ${mm(r)}  agent ${r.id} (${r.type || "agent"}${r.description ? `: ${r.description}` : ""}) — ${r.scope}${r.scope.length >= 80 ? "…" : ""}`);
      else {
        L.push(`   ${mm(r)}  person (proposed)`);
        for (const iv of r.intervals) L.push(`        ${fmtShort(Date.parse(iv.from))} → ${fmtShort(Date.parse(iv.to))}  raw ${iv.raw.toFixed(2)}  free ${iv.afterOverlap.toFixed(2)}  counted ${iv.counted.toFixed(2)}  here ${iv.inThisSegment.toFixed(2)}  [${iv.kind}${iv.note ? `; ${iv.note}` : ""}]`);
      }
    }
    const t = s.totals;
    L.push(`   -- ${t.rows} rows · AI ${t.ai.toFixed(2)} · person (proposed) ${t.humanProposed.toFixed(2)} · overall ${t.overall.toFixed(2)} min (${t.hours.toFixed(2)} h)`);
  }
  const t = result.totals;
  L.push("", `TOTAL  ${t.rows} rows · AI ${t.ai.toFixed(2)} min · person (proposed) ${t.humanProposed.toFixed(2)} min · overall ${t.overall.toFixed(2)} min (${t.hours.toFixed(2)} h)`);
  process.stdout.write(L.join("\n") + "\n");
}
process.exit(0);
