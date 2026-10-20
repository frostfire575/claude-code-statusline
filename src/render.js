// Claude Code status line: fixed 60-column box with ctx/5h/7d meters stacked on the left
const fs = require("fs");
const path = require("path");
const os = require("os");

// `config`: { caveman: "auto" | "off", usage: boolean }, see install.js.
module.exports = function render(raw, config = {}) {
  let d = {};
  try { d = JSON.parse(raw); } catch {}

  if (process.env.CLAUDE_STATUSLINE_DEBUG === "1") {
    try {
      fs.writeFileSync(path.join(os.homedir(), ".claude", "statusline-last-input.json"), raw);
    } catch {}
  }

  const fg = (r, g, b, s) => `\x1b[38;2;${r};${g};${b}m${s}\x1b[0m`;
  const bold = (s) => `\x1b[1m${s}\x1b[0m`;
  const dim = (s) => `\x1b[2m${s}\x1b[22m`;

  const C = {
    frame: (s) => fg(85, 85, 100, s),
    label: (s) => fg(125, 125, 140, s),
    value: (s) => fg(205, 205, 215, s),
    model: (s) => bold(fg(186, 142, 255, s)),
    fast:  (s) => bold(fg(255, 215, 90, s)),
  };

  const heat = (pct) => {
    if (pct >= 85) return [255, 95, 95];
    if (pct >= 60) return [255, 190, 90];
    return [120, 220, 140];
  };

  // ---- Data ----
  const model = d?.model?.display_name || "Claude";
  const effort = d?.effort?.level;
  const fast = d?.fast_mode === true;
  const sessionName = d?.session_name;
  const cw = d?.context_window || {};
  const ctxMax = cw.context_window_size;
  const cu = cw.current_usage || {};
  const ctxUsed =
    (cu.input_tokens || 0) +
    (cu.output_tokens || 0) +
    (cu.cache_creation_input_tokens || 0) +
    (cu.cache_read_input_tokens || 0);
  const pct = cw.used_percentage;
  const sessTin = cw.total_input_tokens;
  const sessTout = cw.total_output_tokens;
  const cache = d?.prompt_cache;

  const cost = d?.cost?.total_cost_usd;
  const durMs = d?.cost?.total_duration_ms;
  const linesAdd = d?.cost?.total_lines_added;
  const linesDel = d?.cost?.total_lines_removed;
  const cwd = d?.workspace?.current_dir || d?.cwd || process.cwd();
  const dirName = path.basename(cwd);

  const rl5 = d?.rate_limits?.five_hour;
  const rl7 = d?.rate_limits?.seven_day;

  const gitBranch = (() => {
    try {
      let dir = cwd;
      for (let i = 0; i < 8; i++) {
        const head = path.join(dir, ".git", "HEAD");
        if (fs.existsSync(head)) {
          const h = fs.readFileSync(head, "utf8").trim();
          const m = h.match(/^ref: refs\/heads\/(.+)$/);
          return m ? m[1] : h.slice(0, 7);
        }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
    } catch {}
    return null;
  })();

  // ---- Formatters ----
  const { fmtK } = require("./usage");
  const fmtDur = (ms) => {
    if (ms == null) return null;
    const s = Math.max(0, Math.floor(ms / 1000));
    const day = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (day) return `${day}d ${String(h).padStart(2, "0")}h`;
    if (h) return `${h}h ${String(m).padStart(2, "0")}m`;
    if (m) return `${m}m ${String(sec).padStart(2, "0")}s`;
    return `${sec}s`;
  };
  const fmtUntil = (epochSec) => {
    if (!epochSec) return null;
    const ms = epochSec * 1000 - Date.now();
    return ms <= 0 ? "now" : fmtDur(ms);
  };

  const makeBar = (p, segs = 12) => {
    const filled = Math.max(0, Math.min(segs, Math.round((p / 100) * segs)));
    const [r, g, b] = heat(p);
    return fg(r, g, b, "▰".repeat(filled)) + dim("▱".repeat(segs - filled));
  };

  // Emoji from U+1F000 up (🪨) take two terminal cells; ◆, ▰ and ⛏ take one.
  const visLen = (s) =>
    [...s.replace(/\x1b\[[0-9;]*m/g, "")].reduce((n, c) => n + (c.codePointAt(0) >= 0x1f000 ? 2 : 1), 0);
  const trunc = (s, n) => ([...s].length > n ? [...s].slice(0, Math.max(0, n - 1)).join("") + "…" : s);
  const pad = (s, w) => s + " ".repeat(Math.max(0, w - visLen(s)));

  // ---- Layout ----
  // Claude Code never sends the pane width, so the box is a fixed 60 columns: narrow
  // enough for split panes, and every cell stays put so the eye learns where to look.
  const W = 60;
  const LEFT = 35;
  const RIGHT = W - LEFT - 7; // "│ " + left + " │ " + right + " │"
  const BAR = 14;

  // Border row with a label at each end; `rightRaw` is plain text, truncated to fit
  // inside the optional `quote` pair so a long session name keeps its closing quote.
  const border = (l, r, left, rightRaw, colorRight, quote = ["", ""], w = W) => {
    const lw = left ? visLen(left) + 2 : 0;
    const room = w - 4 - lw - 2 - 1 - quote.join("").length; // corners, label gaps, min 1 dash
    const right = rightRaw ? colorRight(quote[0] + trunc(rightRaw, Math.max(1, room)) + quote[1]) : "";
    const rw = right ? visLen(right) + 2 : 0;
    const fill = "─".repeat(Math.max(1, w - 4 - lw - rw));
    return (
      C.frame(`${l}─`) + (left ? ` ${left} ` : "") + C.frame(fill) + (right ? ` ${right} ` : "") + C.frame(`─${r}`)
    );
  };

  const row = (left, right) =>
    C.frame("│ ") + pad(left, LEFT) + C.frame(" │ ") + pad(right, RIGHT) + C.frame(" │");

  const meter = (label, p, extra) => {
    if (p == null) return `${C.label(label.padEnd(5))}${C.frame("—")}`;
    const n = Math.round(Number(p) || 0);
    return (
      C.label(label.padEnd(5)) +
      makeBar(n, BAR) +
      fg(...heat(n), `${n}%`.padStart(5)) +
      (extra ? "  " + C.label(extra) : "")
    );
  };

  // ---- Top border: model left, folder · branch right ----
  let title = C.model(`◆ ${model}`);
  if (effort) title += C.label(` · ${effort}`);
  if (fast) title += C.fast(" fast");
  const where = [trunc(dirName, 22), gitBranch && trunc(gitBranch, 18)].filter(Boolean).join(" · ");
  const top = border("╭", "╮", title, where, C.value);

  // ---- Body: meters left, session stats right ----
  const ctxExtra = ctxUsed && ctxMax ? `${fmtK(ctxUsed)}/${fmtK(ctxMax)}` : "";
  const lim = (rl) => (rl?.resets_at ? [rl.used_percentage ?? 0, `↻ ${fmtUntil(rl.resets_at)}`] : [null, ""]);
  const [p5, x5] = lim(rl5);
  const [p7, x7] = lim(rl7);

  const costCell = cost != null ? C.value(`$${cost.toFixed(3)}`) : "";
  const timeCell = durMs != null ? C.label("◷ ") + C.value(fmtDur(durMs)) : "";
  const cacheCell =
    cache && cache.hit_ratio != null
      ? fg(...(cache.warm ? [120, 220, 140] : [130, 130, 140]), cache.warm ? "●" : "○") +
        C.label(" cache ") + C.value(`${Math.round(cache.hit_ratio * 100)}%`)
      : "";

  const body = [
    row(meter("ctx", pct, ctxExtra), costCell),
    row(meter("5h", p5, x5), timeCell),
    row(meter("7d", p7, x7), cacheCell),
  ];

  // ---- Bottom border: tokens and diff left, session name right ----
  const foot = [
    sessTin != null && sessTout != null && `↑${fmtK(sessTin)} ↓${fmtK(sessTout)}`,
    (linesAdd || linesDel) && `+${linesAdd || 0} -${linesDel || 0}`,
  ].filter(Boolean).join(" · ");
  const bottom = border("╰", "╯", foot && C.label(foot), sessionName, C.label, ["“", "”"]);

  const main = [top, ...body, bottom];

  // ---- Usage box (right): today / 7 days / month from the ledger ----
  let side = null;
  let cave = null;
  let caveMode = null;
  try { caveMode = cavemanMode(d?.session_id); } catch {}
  // No mode file means the caveman plugin isn't installed, so its box would only ever say "off".
  const showCave = config.caveman !== "off" && caveMode != null;
  try {
    const usage = require("./usage");
    const on = caveMode ? (caveMode.mode === "off" ? 0 : 1) : 0;
    const live = usage.ingest(d?.session_id, d?.transcript_path, cost, on);
    const sum = usage.summary(d?.session_id, live);
    if (config.usage !== false) side = usageBox(sum, usage.localDay);
    if (showCave) try { cave = cavemanBox(caveMode, sum, usage); } catch {}
  } catch {}

  return main.map((l, i) => [l, side && side[i], cave && cave[i]].filter(Boolean).join(" ")).join("\n");

  // Same lookup and guards as the plugin's caveman-statusline.ps1. Read inline because the
  // plugin lives under a versioned cache folder that moves on every update.
  function cavemanMode(sessionId) {
    const dir = path.join(os.homedir(), ".claude");
    const valid = ["off", "lite", "full", "ultra", "wenyan-lite", "wenyan", "wenyan-full", "wenyan-ultra", "commit", "review", "compress"];
    const read = (file) => {
      try {
        const st = fs.lstatSync(file);
        if (st.isSymbolicLink() || st.size > 64) return null;
        const m = fs.readFileSync(file, "utf8").split(/\r?\n/)[0].trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
        return valid.includes(m) ? m : null;
      } catch { return null; }
    };
    if (sessionId && /^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) {
      const m = read(path.join(dir, ".caveman-sessions", `${sessionId}.mode`));
      if (m) return { mode: m, source: "session" };
    }
    const m = read(path.join(dir, ".caveman-active"));
    return m ? { mode: m, source: "global" } : null;
  }

  function cavemanBox(cm, { byDay, sessionCave }, usage) {
    const CW = 24;
    const amber = (s) => bold(fg(230, 150, 70, s));
    const mode = cm?.mode || "off";
    const active = mode !== "off";
    const level = { lite: 1, full: 2, ultra: 3 }[mode.replace(/^wenyan-?/, "") || "full"];
    const pips = level
      ? (active ? fg(230, 150, 70, "▰".repeat(level)) : "") + dim("▱".repeat(active ? 3 - level : 3))
      : "";
    const name = active ? amber(mode.toUpperCase()) : C.label("off");
    const inner = CW - 4;
    const line = (s) => C.frame("│ ") + pad(s, inner) + C.frame(" │");
    const spread = (l, r) => l + " ".repeat(Math.max(1, inner - visLen(l) - visLen(r))) + r;

    const avg = (t) => (t.n ? fmtK(Math.round(t.out / t.n)) : "—");
    const now = sessionCave ? sessionCave[active ? "on" : "off"] : { n: 0 };
    const month = new Set(Array.from({ length: 30 }, (_, i) => usage.localDay(new Date(Date.now() - i * 86400000))));
    const m30 = usage.caveSplit(byDay, (day) => month.has(day));

    // Estimate only: what caveman messages would have cost at the caveman-off average.
    // Confounded by task mix, hence "~"; needs messages on both sides before it shows a number.
    let saved = C.label("saved —");
    if (m30.on.n && m30.off.n) {
      const diff = Math.round((m30.off.out / m30.off.n - m30.on.out / m30.on.n) * m30.on.n);
      saved = diff >= 0 ? fg(120, 220, 140, `saved ~${fmtK(diff)}`) : fg(255, 95, 95, `extra ~${fmtK(-diff)}`);
    }

    return [
      border("╭", "╮", C.label("🪨 caveman"), mode.startsWith("wenyan") ? "wenyan" : "en", C.label, ["", ""], CW),
      line(spread(name, pips)),
      line(C.label("now  ") + C.value(avg(now).padStart(5)) + C.label(" tok/msg")),
      line(C.label("cave ") + C.value(avg(m30.on)) + C.frame(" · ") + C.label("off ") + C.value(avg(m30.off))),
      border("╰", "╯", saved, "30d", C.label, ["", ""], CW),
    ];
  }

  function usageBox({ byDay, sessionDays }, localDay) {
    const UW = 40;
    const now = new Date();
    const today = localDay();
    const lastDays = (n) => Array.from({ length: n }, (_, i) => localDay(new Date(now - (n - 1 - i) * 86400000)));
    const week = lastDays(7);
    const month = new Set(lastDays(30));

    const tally = (inRange) => {
      let tok = 0, cost = 0;
      for (const [day, e] of Object.entries(byDay)) if (inRange(day)) { tok += e.tok; cost += e.cost; }
      const sess = sessionDays.filter((days) => Object.keys(days).some(inRange)).length;
      return { tok, cost, sess };
    };
    // Backfilled days have tokens but no cost (transcripts don't record it), so show a dash.
    const fmtCost = (c, tok) => (c > 0 ? `$${c.toFixed(c >= 100 ? 0 : 2)}` : tok ? "—" : "$0");

    const urow = (label, t) =>
      C.frame("│ ") +
      pad(
        C.label(label.padEnd(7)) +
          C.value(`${fmtK(t.tok)}`.padStart(7)) + C.label(" tok") +
          C.value(fmtCost(t.cost, t.tok).padStart(9)) +
          C.value(`${t.sess}`.padStart(4)) + C.label(" sess"),
        UW - 4
      ) +
      C.frame(" │");

    const all = tally(() => true);
    const vals = week.map((day) => byDay[day]?.tok || 0);
    const max = Math.max(...vals);
    const ticks = "▁▂▃▄▅▆▇█";
    const spark =
      vals.map((v, i) => {
        const ch = ticks[max ? Math.round((v / max) * 7) : 0];
        return i === 6 ? C.value(ch) : C.label(ch);
      }).join("") + C.label(" 7d");

    const foot = C.label(`total ${fmtK(all.tok)} · ${fmtCost(all.cost, all.tok)}`);
    // The sparkline is multi-coloured, so the bottom edge is assembled here rather than via border().
    const gap = UW - 4 - (visLen(foot) + 2) - (visLen(spark) + 2);
    return [
      border("╭", "╮", C.label("usage"), "rolling", C.label, ["", ""], UW),
      urow("today", tally((day) => day === today)),
      urow("7 days", tally((day) => week.includes(day))),
      urow("30 days", tally((day) => month.has(day))),
      C.frame("╰─") + ` ${foot} ` + C.frame("─".repeat(Math.max(1, gap))) + ` ${spark} ` + C.frame("─╯"),
    ];
  }
};
