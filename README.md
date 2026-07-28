# Expandso

[English](README.md) | [中文](README.zh-CN.md)

[Download Expandso v0.5.0](https://github.com/JunchenZheng/Espandso/releases/tag/v0.5.0) | [User Guide](https://expandso.gitbook.io/expandso-user-guide)

Expandso is a user-friendly and intuitive desktop app wrapper for Espanso. It simplifies snippet management by offering a clean GUI to preview YAML configs, add text matches, validate triggers, and restart Espanso in one click.

(Espanso + Expand = Expandso)

## Features

- **Add snippets**: Create text, file, image, and form snippets directly from the desktop app.
- **Delete snippets**: Remove single snippets or batch-delete selected matches from YAML configs.
- **Visual YAML editing**: Preview and edit Espanso YAML files with a focused visual editor.
- **Alfred import**: Import Alfred snippets into the selected Espanso collection.
- **Conflict detection**: Detect duplicate or conflicting triggers before saving.

## Command Line Mode

**Command Line Mode currently supports macOS only. Windows and more platforms will be supported in future releases.**

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

By default, snippets are written to `base.yml` inside the Espanso match directory resolved from `espanso path`, with a platform default fallback. Espanso reloads snippets from file changes, so the CLI does not run `espanso restart` unless `--restart` is passed. Use `--config` to select another YAML file or `--match-dir` to provide a match directory.

On macOS, `./install_tauri_app.sh` installs the command as `~/.local/bin/expandso` by linking it to the executable inside `Expandso.app`. Make sure `~/.local/bin` is in your shell `PATH`.

## Development

### Quick Install

Build the Tauri `.app` bundle, install it to `/Applications`, install the CLI link, stop any old Expandso process, and launch the new app:

```bash
./install_tauri_app.sh
```

Install to a custom directory:

```bash
./install_tauri_app.sh "$HOME/Applications"
```

### Detailed Commands

Check Node.js/npm and install project dependencies:

```bash
./scripts/setup_npm_env.sh
```

Check the local Node.js/npm environment without installing dependencies:

```bash
./scripts/setup_npm_env.sh --check-only
```

Run the Vite frontend only:

```bash
npm run dev
```

Run the Tauri desktop app in development mode:

```bash
npm run tauri dev
```

Type-check and build the frontend into `dist-gui/`:

```bash
npm run build
```

Build the macOS `.app` bundle:

```bash
npm run tauri build
```

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

macOS builds require Rust/Cargo and Apple Command Line Tools because Tauri produces a native macOS app bundle.

## Documentation

- [User Guide](https://expandso.gitbook.io/expandso-user-guide)
- [UI Design System](docs/DESIGN_SYSTEM.md)
