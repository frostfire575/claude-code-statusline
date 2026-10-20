#!/usr/bin/env node
// Builds docs/screenshot.png for the README: renders the status line against a made-up home
// folder (demo ledger, no real usage), converts the ANSI output to HTML, and screenshots it
// with headless Chrome or Edge. Usage: node scripts/screenshot.js [path-to-chrome]
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const home = fs.mkdtempSync(path.join(os.tmpdir(), "ccsl-shot-"));
const claude = path.join(home, ".claude");
const sessions = path.join(claude, "usage", "sessions");
fs.mkdirSync(sessions, { recursive: true });
fs.writeFileSync(path.join(claude, ".caveman-active"), "full\n");

// Deterministic fake ledger: 30 days of sessions, caveman on for the last 12 days.
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const day = (ago) => {
  const d = new Date(Date.now() - ago * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
let n = 0;
for (let ago = 29; ago >= 0; ago--) {
  if (ago > 0 && rnd() < 0.2) continue;
  for (let s = 0, count = 1 + Math.floor(rnd() * 3); s < count; s++) {
    const msgs = {};
    const cave = ago <= 12 ? 1 : 0;
    for (let m = 0; m < 40 + rnd() * 80; m++) {
      msgs[`msg_${n}_${m}`] = [day(ago), Math.round(40000 + rnd() * 120000), Math.round(cave ? 250 + rnd() * 500 : 600 + rnd() * 900), cave];
    }
    const state = { v: 2, project: "demo", files: {}, msgs, lastCost: 0, days: { [day(ago)]: { cost: 1 + rnd() * 6 } } };
    // Today's last session doubles as the live one, so "today" and "now" have numbers.
    const id = ago === 0 && s === count - 1 ? "demo-live" : `demo-${n}`;
    n++;
    fs.writeFileSync(path.join(sessions, `${id}.json`), JSON.stringify(state));
  }
}

const now = Math.floor(Date.now() / 1000);
const input = {
  session_id: "demo-live",
  session_name: "fix login flow",
  model: { display_name: "Opus 5.5" },
  effort: { level: "high" },
  workspace: { current_dir: path.join(home, "my-project") },
  cost: { total_cost_usd: 1.24, total_duration_ms: 657000, total_lines_added: 291, total_lines_removed: 37 },
  context_window: {
    context_window_size: 1000000, used_percentage: 12, total_input_tokens: 120400, total_output_tokens: 8200,
    current_usage: { input_tokens: 4, output_tokens: 900, cache_creation_input_tokens: 6100, cache_read_input_tokens: 113400 },
  },
  prompt_cache: { warm: true, hit_ratio: 0.96 },
  rate_limits: {
    five_hour: { used_percentage: 64, resets_at: now + 2 * 3600 + 12 * 60 },
    seven_day: { used_percentage: 14, resets_at: now + 6 * 86400 + 13 * 3600 },
  },
};
fs.mkdirSync(path.join(home, "my-project", ".git"), { recursive: true });
fs.writeFileSync(path.join(home, "my-project", ".git", "HEAD"), "ref: refs/heads/main\n");

const env = { ...process.env, USERPROFILE: home, HOME: home };
const ansi = execFileSync(process.execPath, [path.join(ROOT, "bin", "cli.js")], { input: JSON.stringify(input), env }).toString();

// ANSI SGR to HTML spans. The status line only uses 38;2 truecolor, bold, dim and resets.
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
let style = { fg: null, bold: false, dim: false };
let html = "";
for (const part of ansi.split(/(\x1b\[[0-9;]*m)/)) {
  const m = part.match(/^\x1b\[([0-9;]*)m$/);
  if (m) {
    const c = m[1].split(";").map(Number);
    for (let i = 0; i < c.length; i++) {
      if (c[i] === 0) style = { fg: null, bold: false, dim: false };
      else if (c[i] === 1) style.bold = true;
      else if (c[i] === 2) style.dim = true;
      else if (c[i] === 22) { style.bold = false; style.dim = false; }
      else if (c[i] === 38 && c[i + 1] === 2) { style.fg = `rgb(${c[i + 2]},${c[i + 3]},${c[i + 4]})`; i += 4; }
    }
    continue;
  }
  if (!part) continue;
  // Glyphs the mono font lacks fall back to fonts with other widths; pin each to its terminal
  // cell count (emoji 2, the rest 1) so the box edges stay aligned.
  const text = [...part].map((ch) => {
    const cp = ch.codePointAt(0);
    if (cp >= 0x1f000) return `<span class="wide">${ch}</span>`;
    if (cp > 0x7f && !(cp >= 0x2500 && cp <= 0x257f)) return `<span class="cell">${ch}</span>`;
    return esc(ch);
  }).join("");
  const css = [style.fg && `color:${style.fg}`, style.bold && "font-weight:700", style.dim && "opacity:.45"].filter(Boolean).join(";");
  html += css ? `<span style="${css}">${text}</span>` : text;
}

const page = `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;background:transparent}
.win{display:inline-block;width:max-content;margin:24px;background:#16161e;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.45);border:1px solid #2a2a36}
.bar{height:34px;display:flex;align-items:center;gap:8px;padding:0 14px}
.bar i{width:12px;height:12px;border-radius:50%;display:block}
pre{margin:0;padding:6px 22px 22px;font:15px/1.2 "Cascadia Mono",Consolas,monospace;color:#cdcdd7}
.cell{display:inline-block;width:1ch;text-align:center}
.wide{display:inline-block;width:2ch;text-align:center;font-family:"Segoe UI Emoji","Apple Color Emoji",sans-serif}
</style><div class="win"><div class="bar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></div><pre>${html}</pre></div>`;

const docs = path.join(ROOT, "docs");
fs.mkdirSync(docs, { recursive: true });
const htmlFile = path.join(home, "shot.html");
fs.writeFileSync(htmlFile, page);

const browser = process.argv[2] || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
].find((p) => fs.existsSync(p));
if (!browser) throw new Error("no Chrome or Edge found; pass its path as the first argument");

const out = path.join(docs, "screenshot.png");
execFileSync(browser, [
  "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=2",
  "--default-background-color=00000000", "--window-size=1225,215",
  `--screenshot=${out}`, `file:///${htmlFile.replace(/\\/g, "/")}`,
], { stdio: "ignore" });
fs.rmSync(home, { recursive: true, force: true });
console.log(`wrote ${out}`);
