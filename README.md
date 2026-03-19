# Expandso

A Tauri desktop app for scanning, previewing, and editing Espanso YAML match files directly.

## Current App Stack

- Tauri v2
- React
- TypeScript
- Vite
- Rust

## Features

- **YAML-First Source Of Truth**: Scans the Espanso match directory and edits YAML files in place.
- **Static Text Snippet Editor**: Adds single-line or multi-line text replacement snippets directly to the selected YAML config.
- **Multiple Triggers (Aliases)**: Supports Espanso `triggers: [...]` for a single snippet alias group.
- **Block Literal YAML Writing**: Multi-line replacement texts are written with YAML block literal style.
- **Validation & Restart**: Validates snippet shape and prefix trigger conflicts before saving, then restarts Espanso.
- **Resource Preview**: Previews existing external resource snippets by resolving their configured shell/echo paths.

## Setup

Check Node.js/npm and install project dependencies:

```bash
./scripts/setup_npm_env.sh
```

Check without installing:

```bash
./scripts/setup_npm_env.sh --check-only
```

## Development

Run the Tauri app in development mode:

```bash
npm run tauri dev
```

## Command Line Mode

Expandso can add snippets without opening the desktop UI, which makes it suitable for third-party launchers such as Alfred and Raycast.

```bash
expandso add --mode text --trigger ":hello" --content "Hello world" --description "Greeting"
expandso add --mode file --trigger ":notes" --content "$HOME/notes/snippet.txt"
expandso add --mode image --trigger ":logo" --content "$HOME/Pictures/logo.png"
```

Modes interpret `--content` differently:

- `text`: replacement text written to `replace`.
- `file`: file path read by Espanso through a shell `cat` variable.
- `image`: image path written to `image_path`.

By default, snippets are written to `base.yml` inside the Espanso match directory resolved from `espanso path`, with a platform default fallback. Use `--config` to select another YAML file, `--match-dir` to provide a match directory, or `--no-restart` to skip the automatic `espanso restart`.

On macOS, `./install_tauri_app.sh` installs the command as `~/.local/bin/expandso` by linking it to the executable inside `Expandso.app`. Make sure `~/.local/bin` is in your shell `PATH`.

Run focused test layers:

```bash
npm run test:unit:ts
npm run test:component
npm run test:integration
npm run test:unit:rs
```

Run the cross-layer unit checks or the full local test suite:

```bash
npm run check:unit
npm run check:all
```

## Build And Install On macOS

Build the Tauri `.app` bundle and install it to `/Applications`:

```bash
./install_tauri_app.sh
```

Install to a custom directory:

```bash
./install_tauri_app.sh "$HOME/Applications"
```

macOS builds still require Rust/Cargo and Apple Command Line Tools because Tauri produces a native macOS app bundle.

## Documentation & UI Guidelines

For details about our UI components, typography hierarchy, and design tokens, see the [UI Design System](file:///Volumes/Sandisk2TB/CodeProject/Espanso_yaml_to_json/docs/DESIGN_SYSTEM.md).

## Current Editing Model

Expandso treats existing Espanso YAML files as the source of truth and writes changes directly to the selected match file.
