# Espanso Snippet Generator

A Tauri desktop app and CLI workflow for managing Espanso snippets from JSON source files.

## Current App Stack

- Tauri v2
- React
- TypeScript
- Vite
- Rust

The previous Swift/Xcode macOS app has been removed. Native desktop builds now go through `src-tauri/`.

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

## CLI Build

Generate Espanso YAML from JSON snippets:

```bash
python build.py
```

Install generated Espanso config and restart Espanso:

```bash
python build.py --install
```
