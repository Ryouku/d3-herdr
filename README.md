# d3-herdr

Our Herdr setup: one layout (`my-bettr`), our key bindings and our mods, kept in
`~/.config/herdr-app/`. Everything else in that folder is written by the Herdr
app or installed by bettr, so it is not in this repository.

**This file is the install procedure, written for a coding agent.** Run the
steps in order and stop at the first check that fails; report its output.

## What is here

| Path | What |
|---|---|
| `layouts/my-bettr.json` | The layout. Built on bettr's panels plus our mods. |
| `keys.json` | Key bindings. |
| `mods/my-spaces` | Spaces sidebar rework: agent rows with program icon and context use, a New space row. |
| `mods/my-usage` | Usage bars. |
| `mods/resource-monitor` | Resource panel: CPU, GPU, memory, disk, listening ports. |
| `mods/bell` | Waiting bell, status counts and jump keys in the top bar. |
| `mods/herdr-sim`, `mods/herdr-sim-screen` | iOS and Android simulator panel. `wobsoriano/herdr-sim` (MIT) with the local changes in its `INSTALLATION.txt`. |

## What is not here, and where it comes from

- **Herdr's own mods and layouts** (`agents`, `spaces`, `tabs`, `worktree`, …):
  the Herdr app writes them into the folder on every start.
- **The bettr mods** (`bettr-context`, `bettr-activity`, `bettr-changes`,
  `bettr-chrome`, `bettr-files`, `bettr-pane`, `bettr-tabs`, `bettr-reporter`,
  `bettr-usage`), `layouts/bettr.json` and `themes/bettr.json`: installed from
  `https://github.com/dissimulate/bettr`. That project has no licence, so it is
  installed from its own repository at a pinned commit and never copied here.
  The layout needs them: Context, Activity, Changes, Files, the pane and the
  tab bar are bettr's.

## Install

Requirements: macOS or Linux, Herdr app 0.1.16 or later with herdr-core (`hc`)
0.1.21 or later, `git`, Python 3.9 or later. The simulator panel also needs
Node (see below).

1. **Herdr has run once.** `~/.config/herdr-app/AGENTS.md` exists. If it does
   not, start the Herdr app, then continue.

2. **bettr, at the commit this layout was built on.**

   ```sh
   git clone https://github.com/dissimulate/bettr.git ~/.local/share/bettr
   git -C ~/.local/share/bettr checkout 7100864
   python3 ~/.local/share/bettr/scripts/install.py --update --hooks
   ```

   `--hooks` merges bettr's reporter hooks into `~/.claude/settings.json` and
   `~/.codex/hooks.json`; this changes the user's agent configuration, so say
   so before running it. Replaced files are backed up under
   `~/.local/state/bettr/backups/`.
   Check: `ls ~/.config/herdr-app/mods/bettr-context/main.js`.

3. **This repository, into the existing config folder.** The folder is not
   empty, so it is fetched in place rather than cloned. `keys.json` is
   replaced; the copy keeps the old one.

   ```sh
   cd ~/.config/herdr-app
   cp keys.json keys.json.before-d3-herdr
   git init -b main
   git remote add origin https://github.com/Ryouku/d3-herdr.git
   git fetch origin main
   git checkout -f -B main origin/main
   ```

   Check: `git status --short` prints nothing, and `ls mods/my-spaces/main.js`.

4. **Switch to the layout.**

   ```sh
   herdr-app do layout.switch '{"name":"my-bettr"}'
   ```

   Check: the window shows the spaces sidebar with agent rows, the usage bars
   and the Resource panel.

5. **Simulator panel (optional).** `mods/herdr-sim/serve-sim.js` puts
   `~/.nvm/versions/node/v24.22.1/bin` first on its `PATH`. Install that Node
   version with nvm, or edit the `SERVE_SIM` line to the machine's Node. iOS
   needs Xcode's simulators; Android needs the SDK's `platform-tools`. The
   panel is hidden in the layout until it is opened.

## Updating

- Ours: `git -C ~/.config/herdr-app pull`.
- bettr: move the pin deliberately. Check out the new commit in
  `~/.local/share/bettr`, rerun its installer with `--update`, confirm the
  layout still works, then change the commit in step 2 of this file.

## Changing it

The folder's `AGENTS.md` (written by the Herdr app) documents layouts, keys and
mods. Only the paths listed in `.gitignore` are versioned: a new mod of ours
needs its own `!/mods/<name>/` line there. `*.d.ts` and `jsconfig.json` are
written into mod folders by Herdr, and the `.jpg` frames in
`mods/herdr-sim-screen` are simulator screens captured at runtime; none of them
is committed.
