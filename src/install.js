const fs = require("fs");
const path = require("path");
const readline = require("readline/promises");
const { claudeDir, installDir, configFile, readConfig } = require("./config");

const ROOT = path.join(__dirname, "..");
const settingsFile = () => path.join(claudeDir(), "settings.json");
const previousFile = () => path.join(installDir(), "previous-statusline.json");
const MARK = "claude-code-statusline";

const parseFlags = (args) => {
  const f = {};
  for (const a of args) {
    const m = a.match(/^--([a-z]+)(?:=(.*))?$/);
    if (m) f[m[1]] = m[2] ?? true;
  }
  return f;
};

const readSettings = () => {
  const file = settingsFile();
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    // Writing over a file we couldn't parse would wipe the user's other settings.
    throw new Error(`could not parse ${file}: ${e.message}. Fix it and run again.`);
  }
};

const writeSettings = (settings) => {
  const file = settingsFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
  fs.writeFileSync(file, JSON.stringify(settings, null, 2) + "\n");
};

const isOurs = (sl) => typeof sl?.command === "string" && sl.command.includes(MARK);

const asker = (flags) => {
  const tty = process.stdin.isTTY && !flags.yes;
  const rl = tty ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;
  return {
    async yesNo(q, def) {
      if (!rl) return def;
      const a = (await rl.question(`${q} ${def ? "(Y/n)" : "(y/N)"} `)).trim().toLowerCase();
      return a ? a.startsWith("y") : def;
    },
    close: () => rl?.close(),
    tty,
  };
};

const onOff = (v, name) => {
  if (v == null) return null;
  if (["on", "auto", "true", "yes"].includes(v)) return true;
  if (["off", "false", "no"].includes(v)) return false;
  throw new Error(`--${name} takes on or off, got "${v}"`);
};

async function init(args) {
  const flags = parseFlags(args);
  const settings = readSettings();
  const dest = installDir();
  const ask = asker(flags);

  try {
    const existing = settings.statusLine;
    if (existing && !isOurs(existing)) {
      console.log(`You already have a status line:\n  ${JSON.stringify(existing)}`);
      if (!ask.tty && !flags.yes) throw new Error("rerun with --yes to replace it");
      if (!flags.yes && !(await ask.yesNo("Replace it? Uninstall puts it back.", false))) {
        return console.log("Nothing changed.");
      }
    }

    const prev = readConfig();
    const caveman = onOff(flags.caveman, "caveman") ??
      (await ask.yesNo("Show the caveman box when the caveman plugin is active?", prev.caveman !== "off"));
    const usage = onOff(flags.usage, "usage") ??
      (await ask.yesNo("Show the usage box (today / 7 days / 30 days)?", prev.usage !== false));

    if (path.resolve(ROOT) !== path.resolve(dest)) {
      fs.mkdirSync(dest, { recursive: true });
      for (const p of ["bin", "src"]) {
        fs.rmSync(path.join(dest, p), { recursive: true, force: true });
        fs.cpSync(path.join(ROOT, p), path.join(dest, p), { recursive: true });
      }
      fs.copyFileSync(path.join(ROOT, "package.json"), path.join(dest, "package.json"));
    }
    fs.writeFileSync(configFile(), JSON.stringify({ caveman: caveman ? "auto" : "off", usage }, null, 2) + "\n");

    if (existing && !isOurs(existing)) fs.writeFileSync(previousFile(), JSON.stringify(existing, null, 2) + "\n");

    const cli = path.join(dest, "bin", "cli.js").replace(/\\/g, "/");
    settings.statusLine = { type: "command", command: `node "${cli}"` };
    writeSettings(settings);

    console.log(`Installed to ${dest}\nStatus line set in ${settingsFile()}. It shows up on the next Claude Code message.`);
  } finally {
    ask.close();
  }
}

async function uninstall() {
  const settings = readSettings();
  if (isOurs(settings.statusLine)) {
    let prev = null;
    try { prev = JSON.parse(fs.readFileSync(previousFile(), "utf8")); } catch {}
    if (prev) settings.statusLine = prev;
    else delete settings.statusLine;
    writeSettings(settings);
    console.log(prev ? "Restored your previous status line." : "Removed statusLine from settings.json.");
  } else {
    console.log("settings.json doesn't point at claude-code-statusline; left it alone.");
  }
  fs.rmSync(installDir(), { recursive: true, force: true });
  console.log(`Removed ${installDir()}. Usage history in ${path.join(claudeDir(), "usage")} was kept.`);
}

module.exports = { init, uninstall };
