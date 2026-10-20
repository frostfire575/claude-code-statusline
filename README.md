# claude-code-statusline

A boxed status line for [Claude Code](https://claude.com/claude-code). Every cell has a fixed spot, so after a day you find things by position and read the color at a glance.

```
╭─ ◆ Opus 5.5 · medium ──────────────── my-project · main ─╮ ╭─ usage ──────────────────── rolling ─╮
│ ctx  ▰▰▱▱▱▱▱▱▱▱▱▱▱▱  12%  120k/1M   │ $1.240             │ │ today    1.80M tok    $1.40   2 sess │
│ 5h   ▰▰▰▰▰▰▰▰▰▱▱▱▱▱  64%  ↻ 2h 12m  │ ◷ 10m 57s          │ │ 7 days   42.0M tok   $18.20  11 sess │
│ 7d   ▰▰▱▱▱▱▱▱▱▱▱▱▱▱  14%  ↻ 6d 13h  │ ● cache 96%        │ │ 30 days   310M tok   $96.00  48 sess │
╰─ ↑120k ↓8k · +291 -37 ──────────────── “fix login flow” ─╯ ╰─ total 410M · $120 ────── ▁▃▅▂▇▁▄ 7d ─╯
```

The left box is the current session. The top edge has the model, effort level, fast mode, folder and git branch. The three meters are context window use and your 5-hour and 7-day rate limits, each with the time until it resets. They turn amber at 60% and red at 85%. On the right side of the box are session cost, wall time and prompt cache hit rate. The bottom edge has tokens in and out, lines added and removed, and the session name.

The usage box on the right covers more than one session. Claude Code deletes transcripts after 30 days, and its status line input only describes the live session. So the script tallies tokens from each transcript as it grows, and keeps the totals in `~/.claude/usage/` (one small JSON file per session). Cost comes from Claude Code's own `cost.total_cost_usd`. Days that were counted from old transcripts, before the status line was installed, show a dash for cost because transcripts don't record it.

If you use the caveman plugin for Claude Code, a third box shows the current mode and the average output tokens per message with caveman on and off. It hides itself when caveman isn't installed, and the installer asks whether you want it at all.

## Install

You need Node.js 18 or newer.

```sh
npx @frostfire575/claude-code-statusline init
```

Or straight from GitHub, without npm:

```sh
npx github:frostfire575/claude-code-statusline init
```

Either way, `init` copies the script to `~/.claude/claude-code-statusline/` and points `statusLine` in `~/.claude/settings.json` at it. Claude Code runs the status line on every update, and going through `npx` each time would add a second or more, which is why it copies instead. It asks two questions (caveman box, usage box) and backs up `settings.json` to `settings.json.bak` first. If you already have a status line it shows you the old one and asks before replacing it. `uninstall` puts the old one back.

To skip the questions, for a script or dotfiles setup:

```sh
npx @frostfire575/claude-code-statusline init --yes --caveman=off --usage=on
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

`caveman` is `auto` (show when the plugin is active) or `off`. `usage` turns the rolling usage box on or off.

Set `CLAUDE_STATUSLINE_DEBUG=1` to save the last JSON Claude Code sent to `~/.claude/statusline-last-input.json`. Handy when a cell is blank and you want to see whether the field was there.

## Width

The session box is always 60 columns, which fits a split pane. The usage box adds 41 and the caveman box 25. Claude Code doesn't tell the script how wide the terminal is, so on a narrow pane turn the extra boxes off in `config.json` to keep lines from wrapping.

## Uninstall

```sh
npx @frostfire575/claude-code-statusline uninstall
```

This restores your previous status line (or removes the setting) and deletes `~/.claude/claude-code-statusline/`. It leaves `~/.claude/usage/` alone, so reinstalling later keeps your history. Delete that folder yourself if you want it gone.

## License

MIT
