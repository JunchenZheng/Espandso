# AGENTS.md

This file provides guidance to Codex when working in this repository.

## Project Overview

Espanso Snippet Generator is a Tauri v2 desktop app for managing Espanso snippets from user-selected JSON snippet workspaces. The app lets users choose or drag in a directory that contains a `snippets/` folder, edit snippet JSON files, validate entries, import legacy Espanso YAML, generate Espanso YAML, and optionally install/restart Espanso.

The current architecture is Tauri + React + TypeScript + Rust. Legacy Python scripts still exist as reference/CLI utilities, but new app features should be implemented in TypeScript/Rust unless the user explicitly asks for Python work.

## Commands

```bash
# Install frontend/Tauri dependencies
npm install

# Run the Vite frontend only
npm run dev

# Type-check and build the frontend into dist-gui/
npm run build

# Run the Tauri desktop app in development mode
npm run tauri dev

# Build the macOS .app bundle
npm run tauri build

# Build and install the Tauri .app bundle to /Applications on macOS
./install_tauri_app.sh

# Run TypeScript logic tests
npx vitest run
```

Legacy CLI/reference commands:

```bash
# Legacy Python JSON -> YAML generator
python build.py

# Legacy Python install flow
python build.py --install
```

## Architecture

Primary app flow:

```text
User-selected repo path
  -> repoPath/snippets/**/*.json
  -> src/logic/discoverSnippetFiles.ts
  -> src/logic/validate.ts
  -> src/logic/generateYaml.ts
  -> src/tauri/espansoRuntime.ts
  -> Espanso config + espanso restart
```

Legacy YAML import flow:

```text
Espanso YAML
  -> src/logic/importYaml.ts
  -> Snippet JSON shape
  -> optional resource file copy
  -> user-selected snippets workspace
```

Important directories:

```text
src/
  App.tsx                    Main React application and workflow orchestration
  components/ui/             shadcn/ui-style primitives used by the app
  lib/utils.ts               Shared frontend utilities
  logic/                     Pure TypeScript snippet parsing, validation, import, and YAML generation
  tauri/                     Tauri-facing storage/runtime helpers

src-tauri/
  src/                       Rust Tauri entry points
  capabilities/              Tauri v2 permissions/capabilities
  tauri.conf.json            Desktop app configuration

tools/
  migrate_legacy.py          Legacy/reference migration script

snippets/
  Local user data only. This directory is intentionally gitignored.
```

## Data And Privacy Rules

- `snippets/` is a local user-selected data directory and may contain sensitive personal snippets. Never add it to git.
- Do not assume the project root contains the user's active snippet workspace. The app should work with a manually selected directory containing `snippets/`.
- Do not hardcode personal absolute paths into source files, tests, or docs.
- Generated files and build outputs must stay out of git: `dist/`, `dist-gui/`, `node_modules/`, `src-tauri/target/`, and `src-tauri/gen/schemas/`.
- If adding sample snippets, put synthetic fixtures under `test_data/` or another clearly named fixture directory, not under `snippets/`.

## Snippet JSON Shape

Snippet files use this shape:

```ts
interface SnippetFile {
  version: number;
  snippets: Snippet[];
}

interface Snippet {
  trigger: string;
  replace?: string;
  include_file?: string;
  description?: string;
}
```

Rules:

- `trigger` is required and must be a non-empty string.
- A snippet should use either `replace` or `include_file`.
- `replace` is inline text content.
- `include_file` points to a resource file relative to the snippet JSON file/workspace context.
- Trigger uniqueness and include-file existence should be validated before build/install actions.

## YAML Output Rules

- Espanso output root key is `matches`.
- Inline snippets emit `trigger`, `replace`, and optional `description`.
- Multi-line `replace` values should use YAML block literal style.
- `include_file` snippets are converted into Espanso `vars` that read the file content and expose it as `{{output}}`.
- Prefer the existing `yaml` package and `src/logic/generateYaml.ts`; do not hand-roll YAML with string concatenation.

## Development Rules

- Prefer TypeScript logic in `src/logic/` for parsing, validation, YAML generation, and migration behavior.
- Prefer Tauri helpers in `src/tauri/` for filesystem, settings, Espanso path detection, installation, and restart behavior.
- Keep React components focused on UI state and workflows; move reusable pure behavior into `src/logic/`.
- When porting behavior from `build.py` or `tools/migrate_legacy.py`, treat Python as a reference, not as the long-term implementation target.
- Keep Rust changes in `src-tauri/src/` small and limited to native functionality that cannot be handled cleanly through Tauri plugins.
- Use existing UI primitives in `src/components/ui/` and shared `cn()` from `src/lib/utils.ts`.
- Run relevant tests/builds after changes. For frontend logic, prefer `npx vitest run`; for UI/build changes, run `npm run build`; for desktop integration, run `npm run tauri dev` or `npm run tauri build` when appropriate.

## Documentation Workflow

- The key words `MUST`, `MUST NOT`, `REQUIRED`, `SHALL`, `SHALL NOT`, `SHOULD`, `SHOULD NOT`, `RECOMMENDED`, `MAY`, and `OPTIONAL` in this document are to be interpreted as described in RFC 2119.
- Keep `README.md` aligned with the user-facing setup and development workflow.
- Keep this file aligned with the actual architecture after major changes.
- Keep `next_step.md` focused on the immediate next development milestone.
- Do not recreate historical archive files unless the user explicitly wants that workflow back.
- Whenever a set of modifications is finished, MUST run `./install_tauri_app.sh` to automatically build, install, kill the old process, and launch the new application.
- After running the installation script, create a change log entry in `.change_log/` using this ISO 8601:2019 filename pattern: `[YYYY-MM-DDTHH-mm-ss]-[change-description].md`. Use local time, hyphens instead of colons in the time component, and a short kebab-case description, for example `.change_log/2025-05-25T20-17-46-add-agent-docs.md`.
- Select the appropriate change-log template for the kind of work completed. If no project-specific template exists yet, use a concise documentation/change summary format with sections for Summary, Files Changed, Validation, and Follow-up.
- After completing each task, provide a suggested Conventional Commit message at the end of the final response. Do not create the commit automatically unless the user explicitly asks for it.
- Conventional Commit suggestions MUST use a type prefix followed by an OPTIONAL `!`, a REQUIRED colon and space, and a short subject: `type: subject` or `type!: subject`. Although Conventional Commits allows an OPTIONAL scope, this project intentionally does not use scopes, so commit suggestions MUST NOT include parentheses such as `feat(ui): ...`.
