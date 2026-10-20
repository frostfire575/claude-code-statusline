#!/usr/bin/env node
const [cmd, ...args] = process.argv.slice(2);

if (cmd === "init" || cmd === "uninstall") {
  require("../src/install")[cmd](args).catch((e) => {
    console.error(`claude-code-statusline: ${e.message}`);
    process.exit(1);
  });
} else if (cmd === "--version" || cmd === "-v") {
  console.log(require("../package.json").version);
} else if (cmd === "--help" || cmd === "-h") {
  console.log(`Usage:
  claude-code-statusline init [--caveman=auto|off] [--usage=on|off] [--yes]
  claude-code-statusline uninstall
  claude-code-statusline            render (Claude Code pipes session JSON to stdin)`);
} else {
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    const { readConfig } = require("../src/config");
    process.stdout.write(require("../src/render")(raw, readConfig()));
  });
}
