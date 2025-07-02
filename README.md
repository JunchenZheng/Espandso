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
- **Validation & Restart**: Validates trigger shape and duplicate triggers before saving, then restarts Espanso.
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
