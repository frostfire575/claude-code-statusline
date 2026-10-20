const fs = require("fs");
const path = require("path");
const os = require("os");

const claudeDir = () => path.join(os.homedir(), ".claude");
const installDir = () => path.join(claudeDir(), "claude-code-statusline");
const configFile = () => path.join(installDir(), "config.json");

const DEFAULTS = { caveman: "auto", usage: true };

const readConfig = () => {
  try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(configFile(), "utf8")) }; } catch { return { ...DEFAULTS }; }
};

module.exports = { claudeDir, installDir, configFile, readConfig, DEFAULTS };
