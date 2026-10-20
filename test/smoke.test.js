const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const CLI = path.join(__dirname, "..", "bin", "cli.js");
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");

const sandbox = () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ccsl-test-"));
  fs.mkdirSync(path.join(home, ".claude"));
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  const run = (args, input = "") => execFileSync(process.execPath, [CLI, ...args], { env, input }).toString();
  const settings = () => JSON.parse(fs.readFileSync(path.join(home, ".claude", "settings.json"), "utf8"));
  return { home, run, settings, done: () => fs.rmSync(home, { recursive: true, force: true }) };
};

test("renders the session box from Claude Code input", () => {
  const s = sandbox();
  try {
    const input = {
      session_id: "t1",
      model: { display_name: "Opus 5.5" },
      context_window: { used_percentage: 42, context_window_size: 200000 },
      rate_limits: { five_hour: { used_percentage: 10, resets_at: Math.floor(Date.now() / 1000) + 3600 } },
      cost: { total_cost_usd: 0.5 },
    };
    const out = strip(s.run([], JSON.stringify(input)));
    const lines = out.split("\n");
    assert.equal(lines.length, 5);
    assert.match(lines[0], /Opus 5\.5/);
    assert.match(out, /42%/);
    assert.match(out, /\$0\.500/);
    assert.doesNotMatch(out, /caveman/, "caveman box hidden without the plugin");
  } finally {
    s.done();
  }
});

test("survives empty and broken input", () => {
  const s = sandbox();
  try {
    assert.match(strip(s.run([], "")), /Claude/);
    assert.match(strip(s.run([], "{not json")), /Claude/);
  } finally {
    s.done();
  }
});

test("init installs, keeps other settings, and uninstall restores the old status line", () => {
  const s = sandbox();
  try {
    const file = path.join(s.home, ".claude", "settings.json");
    fs.writeFileSync(file, JSON.stringify({ model: "x", statusLine: { type: "command", command: "echo old" } }));

    assert.throws(() => s.run(["init"]), "refuses to replace without --yes when not a TTY");
    s.run(["init", "--yes", "--caveman=off", "--usage=off"]);

    const after = s.settings();
    assert.equal(after.model, "x");
    assert.match(after.statusLine.command, /claude-code-statusline/);
    const config = JSON.parse(fs.readFileSync(path.join(s.home, ".claude", "claude-code-statusline", "config.json"), "utf8"));
    assert.deepEqual(config, { caveman: "off", usage: false });

    s.run(["uninstall"]);
    assert.deepEqual(s.settings().statusLine, { type: "command", command: "echo old" });
    assert.ok(!fs.existsSync(path.join(s.home, ".claude", "claude-code-statusline")));
  } finally {
    s.done();
  }
});
