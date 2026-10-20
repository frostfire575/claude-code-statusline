
<p align="center">
  <img
    src="https://raw.githubusercontent.com/frostfire575/claude-code-statusline/main/docs/screenshot.png"
    alt="claude-code-statusline screenshot"
    width="100%"
  >
</p>

<h1 align="center">
  claude-code-statusline
  <img
    src="https://visitor-badge.laobi.icu/badge?page_id=frostfire575.claude-code-statusline&left_text=Repo%20Views&left_color=0d1117&right_color=0d1117"
    alt="Visitors"
    height="24"
  >
</h1>


<p align="center"><strong>A boxed status line for Claude Code: context, rate limits, cost, cache and a 30-day usage ledger.</strong></p>

<p align="center">
  <a href="#quick-start">Quick start</a> · <a href="#what-it-shows">What it shows</a> · <a href="#settings">Settings</a> · <a href="#uninstall">Uninstall</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@frostfire/claude-code-statusline"><img src="https://img.shields.io/npm/v/@frostfire/claude-code-statusline" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@frostfire/claude-code-statusline"><img src="https://img.shields.io/npm/dt/@frostfire/claude-code-statusline?label=total%20downloads&amp;color=brightgreen" alt="Lifetime npm downloads"></a>
  <a href="https://github.com/frostfire575/claude-code-statusline/actions/workflows/ci.yml"><img src="https://github.com/frostfire575/claude-code-statusline/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://www.npmjs.com/package/@frostfire/claude-code-statusline"><img src="https://img.shields.io/node/v/@frostfire/claude-code-statusline" alt="Node.js version"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/dependencies-0-brightgreen.svg" alt="Zero dependencies"></a>
  <a href="https://github.com/frostfire575/claude-code-statusline/issues"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs welcome"></a>
</p>

**claude-code-statusline replaces Claude Code's one-line status bar with a fixed 60-column box** that shows how full the context window is, how close you are to the 5-hour and 7-day rate limits, and what the session has cost so far. A second box keeps a running tally of tokens and spend across all your sessions for today, the last 7 days and the last 30.

Every cell has a fixed spot, so after a day you find things by position and read the color at a glance. Meters turn amber at 60% and red at 85%.

## Why use it?

- **See the rate limit coming.** The 5h and 7d meters show the reset countdown next to the percentage, so you know whether to slow down or wait it out.
- **Know what you spent this month.** Claude Code deletes transcripts after 30 days and only reports the live session. The usage box keeps its own ledger so the numbers survive.
- **One command to install, one to remove.** `init` backs up your settings and asks before touching an existing status line. `uninstall` puts it back.
- **No dependencies.** Plain Node.js, about 30 KB, renders in under 100 ms.

## Table of contents

- [Quick start](#quick-start)
- [What it shows](#what-it-shows)
- [Install options](#install-options)
- [Settings](#settings)
- [Terminal width](#terminal-width)
- [Uninstall](#uninstall)
- [Development](#development)
- [License](#license)

## Quick start

**Requirement:** Node.js **18 or later**.

```sh
npx @frostfire/claude-code-statusline init
```

It asks two questions (show the caveman box, show the usage box), then the status line appears on your next Claude Code message.

## What it shows

### Session box

| Where | What |
| --- | --- |
| Top edge | Model, effort level, fast mode, folder, git branch |
| `ctx` meter | Context window used, with tokens used / window size |
| `5h` / `7d` meters | Rate limit used, with time until it resets |
| Right column | Session cost, wall time, prompt cache hit rate (● warm, ○ cold) |
| Bottom edge | Tokens in ↑ and out ↓, lines added and removed, session name |

### Usage box

Tokens, cost and session count for today, the last 7 days and the last 30, plus an all-time total and a 7-day sparkline.

The script reads each session's transcript as it grows and keeps the totals in `~/.claude/usage/`, one small JSON file per session. Cost comes from Claude Code's own `cost.total_cost_usd`. Days counted from transcripts written before you installed the status line show a dash for cost, because transcripts don't record it.

### Caveman box

If you use the caveman plugin for Claude Code, a third box shows the current mode and the average output tokens per message with caveman on and off. It stays hidden when caveman isn't installed, and the installer asks whether you want it at all.

## Install options

From npm:

```sh
npx @frostfire/claude-code-statusline init
```

Straight from GitHub, without npm:

```sh
npx github:frostfire575/claude-code-statusline init
```

Either way, `init` copies the script to `~/.claude/claude-code-statusline/` and points `statusLine` in `~/.claude/settings.json` at that copy. Claude Code runs the status line on every update, and going through `npx` each time would add a second or more. Before writing, it backs up `settings.json` to `settings.json.bak`.

Skip the questions for a script or dotfiles setup:

```sh
npx @frostfire/claude-code-statusline init --yes --caveman=off --usage=on
```

To update, run `init` again. Your answers are kept.

### By hand

Copy `bin/`, `src/` and `package.json` into any folder, then add this to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node \"/path/to/folder/bin/cli.js\""
  }
}
```

## Settings

`~/.claude/claude-code-statusline/config.json`:

```json
{
  "caveman": "auto",
  "usage": true
}
```

| Key | Values | Default |
| --- | --- | --- |
| `caveman` | `auto` shows the box when the plugin is active, `off` never does | `auto` |
| `usage` | `true` or `false` for the rolling usage box | `true` |

Set `CLAUDE_STATUSLINE_DEBUG=1` to save the last JSON Claude Code sent to `~/.claude/statusline-last-input.json`. That tells you whether a blank cell is a missing field or a bug.

## Terminal width

The session box is always 60 columns, which fits a split pane. The usage box adds 41 and the caveman box 25. Claude Code doesn't tell the script how wide the terminal is, so on a narrow pane turn the extra boxes off in `config.json` to keep lines from wrapping.

## Uninstall

```sh
npx @frostfire/claude-code-statusline uninstall
```

This restores your previous status line (or removes the setting) and deletes `~/.claude/claude-code-statusline/`. It leaves `~/.claude/usage/` alone, so reinstalling later keeps your history. Delete that folder yourself if you want it gone.

## Development

```sh
git clone https://github.com/frostfire575/claude-code-statusline
cd claude-code-statusline
echo '{}' | node bin/cli.js          # render with empty input
node bin/cli.js init                  # install your working copy
npm test                              # smoke tests: render, init, uninstall
node scripts/screenshot.js            # rebuild docs/screenshot.png (needs Chrome or Edge)
```

The screenshot script renders against a throwaway home folder with a made-up ledger, so none of your own usage ends up in the image.

## License

[MIT](LICENSE)
