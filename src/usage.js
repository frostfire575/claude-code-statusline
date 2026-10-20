// Usage ledger for the status line. Claude Code deletes transcripts after 30 days and the
// status line input only carries the live context size, so tokens are tallied here from the
// transcripts as they grow and kept in one small file per session under ~/.claude/usage.
const fs = require("fs");
const path = require("path");
const os = require("os");

const root = () => path.join(os.homedir(), ".claude", "usage");
const sessDir = () => path.join(root(), "sessions");
const CHUNK = 8 * 1024 * 1024;
const SUMMARY_TTL_MS = 30_000;

const fmtK = (n) => {
  if (n == null) return null;
  const sig3 = (v) => `${+v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)}`;
  if (n >= 1_000_000_000) return `${sig3(n / 1_000_000_000)}B`;
  if (n >= 1_000_000) return `${sig3(n / 1_000_000)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
};

const localDay = (t) => {
  const d = t ? new Date(t) : new Date();
  if (isNaN(d)) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const readJson = (f) => {
  try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; }
};
const writeJson = (f, obj) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, f);
};

// Reads complete lines appended since `offset`; returns the new offset. Splitting on the
// newline byte keeps multi-byte characters whole across chunk boundaries.
const readNew = (file, offset, onLine) => {
  let size;
  try { size = fs.statSync(file).size; } catch { return offset; }
  if (size <= offset) return offset;
  const fd = fs.openSync(file, "r");
  try {
    let carry = Buffer.alloc(0);
    let pos = offset;
    while (pos < size) {
      const buf = Buffer.alloc(Math.min(CHUNK, size - pos));
      const n = fs.readSync(fd, buf, 0, buf.length, pos);
      if (!n) break;
      pos += n;
      const data = carry.length ? Buffer.concat([carry, buf.subarray(0, n)]) : buf.subarray(0, n);
      const lastNl = data.lastIndexOf(10);
      if (lastNl < 0) { carry = data; continue; }
      for (const line of data.toString("utf8", 0, lastNl).split("\n")) onLine(line);
      carry = Buffer.from(data.subarray(lastNl + 1));
    }
    return pos - carry.length;
  } finally {
    fs.closeSync(fd);
  }
};

// One assistant message is written on several lines with the same id, and long sessions
// re-write old ids later in the file (after compaction or rewind). Keying by id means each
// API response counts once, with the usage from its last line.
// `cave` (1 on, 0 off, null unknown) is the caveman mode when a message is first seen; later
// lines for the same id keep it, so a mode switch mid-reply doesn't retag the reply.
const ingestFile = (state, file, cave) => {
  state.files[file] = readNew(file, state.files[file] || 0, (line) => {
    if (!line.includes('"usage"')) return;
    let o;
    try { o = JSON.parse(line); } catch { return; }
    const m = o?.message;
    const u = m?.usage;
    if (!u || !m.id) return;
    const day = localDay(o.timestamp);
    if (!day) return;
    const tok =
      (u.input_tokens || 0) + (u.output_tokens || 0) +
      (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
    const prev = state.msgs[m.id];
    state.msgs[m.id] = [day, tok, u.output_tokens || 0, prev ? prev[3] ?? null : cave];
  });
};

const VERSION = 2;
// v1 counted repeated message ids twice; recount tokens from scratch but keep recorded cost,
// which cannot be rebuilt from transcripts.
const migrate = (state) => {
  if (state.v === VERSION) return state;
  const days = {};
  for (const [d, e] of Object.entries(state.days || {})) if (e.cost) days[d] = { cost: e.cost };
  return { v: VERSION, project: state.project, files: {}, msgs: {}, lastCost: state.lastCost || 0, days };
};

const ingest = (sessionId, transcriptPath, cost, cave = null) => {
  if (!sessionId) return null;
  const f = path.join(sessDir(), `${sessionId}.json`);
  const state = migrate(readJson(f) || { project: null, files: {}, lastCost: 0, days: {} });
  const before = JSON.stringify(state);

  if (transcriptPath) {
    state.project ||= path.basename(path.dirname(transcriptPath));
    const files = [transcriptPath];
    const subDir = path.join(path.dirname(transcriptPath), sessionId, "subagents");
    try {
      for (const n of fs.readdirSync(subDir)) if (n.endsWith(".jsonl")) files.push(path.join(subDir, n));
    } catch {}
    for (const file of files) ingestFile(state, file, cave);
  }

  // Only count increases: a lower value is a stale or replayed render, and treating it as a
  // reset would add the same spend again. /clear starts a new session id, so it never needs that.
  if (cost != null && cost > (state.lastCost || 0)) {
    const e = (state.days[localDay()] ||= { cost: 0 });
    e.cost += cost - (state.lastCost || 0);
    state.lastCost = cost;
  }

  if (JSON.stringify(state) !== before) writeJson(f, state);
  return state;
};

// Per-day {tok, cost}: tokens summed from the message map, cost from the recorded deltas.
// cn/co and fn/fo count messages and output tokens with caveman on and off; untagged ones are skipped.
const liveDays = (state) => {
  const days = {};
  const at = (d) => (days[d] ||= { tok: 0, cost: 0, cn: 0, co: 0, fn: 0, fo: 0 });
  for (const [d, e] of Object.entries(state.days || {})) at(d).cost += e.cost || 0;
  for (const [d, tok, out, cave] of Object.values(state.msgs || {})) {
    const e = at(d);
    e.tok += tok;
    if (cave === 1) { e.cn++; e.co += out; }
    else if (cave === 0) { e.fn++; e.fo += out; }
  }
  return days;
};

const caveSplit = (days, inRange = () => true) => {
  const t = { on: { n: 0, out: 0 }, off: { n: 0, out: 0 } };
  for (const [d, e] of Object.entries(days)) {
    if (!inRange(d)) continue;
    t.on.n += e.cn || 0; t.on.out += e.co || 0;
    t.off.n += e.fn || 0; t.off.out += e.fo || 0;
  }
  return t;
};

const loadSessions = () => {
  const sessions = {};
  let names = [];
  try { names = fs.readdirSync(sessDir()); } catch {}
  for (const n of names) {
    if (!n.endsWith(".json")) continue;
    const s = readJson(path.join(sessDir(), n));
    if (s) sessions[n.slice(0, -5)] = { project: s.project, days: liveDays(s) };
  }
  return sessions;
};

const loadAll = () => {
  const sumFile = path.join(root(), "summary.json");
  const cached = readJson(sumFile);
  if (cached && Date.now() - cached.builtAt < SUMMARY_TTL_MS) return cached.sessions;
  const sessions = {};
  for (const [id, s] of Object.entries(loadSessions())) sessions[id] = s.days;
  try { writeJson(sumFile, { builtAt: Date.now(), sessions }); } catch {}
  return sessions;
};

// Per-day totals across all sessions, with the current session's live numbers swapped in.
const summary = (sessionId, liveState) => {
  const sessions = loadAll();
  if (sessionId && liveState) sessions[sessionId] = liveDays(liveState);
  const byDay = {};
  for (const days of Object.values(sessions)) {
    for (const [d, e] of Object.entries(days)) {
      const t = (byDay[d] ||= { tok: 0, cost: 0, sessions: 0, cn: 0, co: 0, fn: 0, fo: 0 });
      t.tok += e.tok;
      t.cost += e.cost;
      t.sessions += 1;
      t.cn += e.cn || 0; t.co += e.co || 0;
      t.fn += e.fn || 0; t.fo += e.fo || 0;
    }
  }
  const sessionCave = sessionId && sessions[sessionId] ? caveSplit(sessions[sessionId]) : null;
  return { byDay, sessionDays: Object.values(sessions), sessionCave };
};

module.exports = { ingest, summary, loadSessions, localDay, fmtK, caveSplit };
