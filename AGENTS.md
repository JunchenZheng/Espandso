# AGENTS.md

This file provides guidance to Codex when working in this repository.

## Project Overview

Expandso is a Tauri v2 desktop app for managing Espanso snippets directly in Espanso YAML match files. The app scans the Espanso match directory, previews YAML configs, adds static text snippets to the selected YAML file, validates trigger rules, writes YAML in place, and restarts Espanso.

The current architecture is Tauri + React + TypeScript + Rust. New app features should be implemented in TypeScript/Rust unless the user explicitly asks for another toolchain.

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

## Architecture

Primary app flow:

```text
Espanso match directory
  -> src/logic/espansoPaths.ts
  -> src/logic/importYaml.ts
  -> src/App.tsx YAML preview + editor
  -> src/logic/yamlEditor.ts
  -> selected Espanso YAML file
  -> src/tauri/espansoRuntime.ts restart
```

Existing resource preview flow:

```text
Espanso YAML
  -> src/logic/importYaml.ts
  -> resource path from echo/shell vars
  -> src/logic/resolveIncludeFile.ts
  -> detail dialog preview
```

Important directories:

```text
src/
  App.tsx                    Main React application and workflow orchestration
  components/ui/             shadcn/ui-style primitives used by the app
  lib/utils.ts               Shared frontend utilities
  logic/                     Pure TypeScript YAML parsing, validation, editing, and path resolution
  tauri/                     Tauri-facing Espanso runtime helpers

src-tauri/
  src/                       Rust Tauri entry points
  capabilities/              Tauri v2 permissions/capabilities
  tauri.conf.json            Desktop app configuration

```

## Data And Privacy Rules

- Espanso YAML files may contain sensitive personal snippets. Do not add user match files or copied personal resources to git.
- Do not assume the project root contains active snippet data. The app reads the user's Espanso match directory at runtime.
- Do not hardcode personal absolute paths into source files, tests, or docs.
- Generated files and build outputs must stay out of git: `dist/`, `dist-gui/`, `node_modules/`, `src-tauri/target/`, and `src-tauri/gen/schemas/`.
- If adding sample snippets, put synthetic fixtures under `test_data/` or another clearly named fixture directory.

## Snippet Shape

The UI uses this internal shape for preview, validation, and YAML append operations:

```ts
interface Snippet {
  trigger?: string;
  triggers?: string[];
  replace?: string;
  include_file?: string;
  description?: string;
}
```

Rules:

- Use either `trigger` or `triggers`.
- Trigger values must be non-empty strings.
- Static text snippets use `replace`.
- `replace` is inline text content.
- `include_file` is used for previewing existing external resource snippets parsed from YAML vars.
- Trigger uniqueness should be validated before writing to YAML.

## YAML Editing Rules

- Espanso YAML root key is `matches`.
- New static snippets append a new match to the selected YAML file.
- New snippets emit `trigger` or `triggers`, `replace`, and optional `description`.
- Multi-line `replace` values should use YAML block literal style.
- Preserve unsupported existing YAML match fields when appending new snippets.
- Prefer the existing `yaml` package and `src/logic/yamlEditor.ts`; do not hand-roll YAML with string concatenation.

## Development Rules

- Prefer TypeScript logic in `src/logic/` for parsing, validation, YAML editing, and migration behavior.
- Prefer Tauri helpers in `src/tauri/` for filesystem, Espanso path detection, and restart behavior.
- Keep React components focused on UI state and workflows; move reusable pure behavior into `src/logic/`.
- Keep Rust changes in `src-tauri/src/` small and limited to native functionality that cannot be handled cleanly through Tauri plugins.
- Use existing UI primitives in `src/components/ui/` and shared `cn()` from `src/lib/utils.ts`.
- When changing user-facing behavior, MUST consider internationalization impact. New or changed visible UI copy, dialog text, alerts, validation/error messages surfaced to users, empty states, placeholders, tooltips, accessibility labels, and control text SHOULD use the existing `src/i18n/` translation system with matching keys in every locale instead of hardcoded English.
- Run relevant tests/builds after changes. For frontend logic, prefer `npx vitest run`; for UI/build changes, run `npm run build`; for desktop integration, run `npm run tauri dev` or `npm run tauri build` when appropriate.

## Documentation Workflow

- The key words `MUST`, `MUST NOT`, `REQUIRED`, `SHALL`, `SHALL NOT`, `SHOULD`, `SHOULD NOT`, `RECOMMENDED`, `MAY`, and `OPTIONAL` in this document are to be interpreted as described in RFC 2119.
- Keep `README.md` aligned with the user-facing setup and development workflow.
- Keep this file aligned with the actual architecture after major changes.
- Keep `next_step.md` focused on the immediate next development milestone.
- Do not recreate historical archive files unless the user explicitly wants that workflow back.
- Whenever a set of modifications is finished, MUST run `./install_tauri_app.sh` to automatically build, install, kill the old process, and launch the new application.
- After running the installation script, create a change log entry in `.change_log/` using this ISO 8601:2019 filename pattern: `[YYYY-MM-DDTHH-mm-ss]-[change-description].md`. Use local time, hyphens instead of colons in the time component, and a short kebab-case description, for example `.change_log/2024-05-25T20-17-46-add-agent-docs.md`.
- Select the appropriate change-log template for the kind of work completed. If no project-specific template exists yet, use a concise documentation/change summary format with sections for Summary, Files Changed, Validation, and Follow-up.
- After completing each task, provide a suggested Conventional Commit message at the end of the final response. Do not create the commit automatically unless the user explicitly asks for it.
- Conventional Commit suggestions MUST use a type prefix followed by an OPTIONAL `!`, a REQUIRED colon and space, and a short subject: `type: subject` or `type!: subject`. Although Conventional Commits allows an OPTIONAL scope, this project intentionally does not use scopes, so commit suggestions MUST NOT include parentheses such as `feat(ui): ...`.
- Conventional Commit prefixes MUST be restricted to the following allowed types:
  - **Core Features & Fixes**:
    - `feat`: New features or capabilities (e.g., `feat: add multi-vendor LLM fallback mechanism`)
    - `fix`: Bug fixes or error resolution (e.g., `fix: resolve database connection timeout issue`)
  - **Code Maintenance & Optimization**:
    - `refactor`: Code refactoring without changing behavior or fixing bugs (e.g., `refactor: optimize prompt formatting logic`)
    - `perf`: Performance or response speed improvements (e.g., `perf: cache frequent recommendation responses`)
    - `style`: Code formatting changes (spaces, semicolons, formatting) without logical impact (e.g., `style: format codebase with black autoformatter`)
  - **Engineering & Project Configuration**:
    - `docs`: Documentation updates or additions (e.g., `docs: update installation and setup commands`)
    - `test`: Adding or modifying tests (e.g., `test: add unit tests for recommendation endpoint`)
    - `chore`: Build process, dependency updates, or auxiliary tool adjustments (e.g., `chore: bump Django to latest patch version`)
    - `ci`: CI/CD automation and deployment configurations (e.g., `ci: update deployment configuration for production`)
