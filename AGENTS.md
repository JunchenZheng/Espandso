# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

Espanso Snippet Generator — a CLI tool that converts a single JSON source file into Espanso YAML configuration and optionally installs it to the local system. The project is currently in the MVP implementation phase.

## Commands

```bash
# Run the build (generate dist/base.yml from snippets/snippets.json)
python build.py

# Install generated config into local Espanso and restart it
python build.py --install

# Dry-run (planned Phase 3)
python build.py --dry-run

# Watch mode (planned Phase 3)
python build.py --watch

# Install dependencies
pip install -r requirements.txt
```

## Architecture

**Single source of truth**: `snippets/snippets.json` — never edit generated YAML manually.

**Data flow**: `snippets/snippets.json` → `src/validator.py` → `src/generator.py` → `dist/base.yml` → (optional) Espanso config dir + `espanso restart`

**Required directory layout** (defined in `agent.md`):
```
├── snippets/          # source JSON (snippets.json)
├── src/
│   ├── __init__.py
│   ├── validator.py   # validation logic, standalone module
│   └── generator.py   # JSON→YAML conversion, standalone module
├── dist/              # generated artifacts (gitignored)
├── build.py           # unified CLI entry point
└── requirements.txt
```

## JSON Schema (`snippets/snippets.json`)

Root object requires `version` (int) and `snippets` (list). Each snippet:

| Field | Type | Required |
|-------|------|----------|
| `trigger` | string | yes |
| `replace` | string | yes |
| `description` | string | no |

## Validation Rules (enforced before any output is written)

- `trigger` and `replace` must be present and non-empty strings — hard error, stop generation
- All triggers must be globally unique — hard error, stop generation
- Multi-line `replace` values (containing `\n`) are handled automatically by the generator

## YAML Output Rules

- Root key is always `matches:`
- 2-space indentation throughout
- Field order: `trigger` → `replace` → `description`
- Multi-line values use `|-` block scalar (strips trailing newline)
- No manual editing of generated files ever

## Installation Logic

- Detect OS to locate the Espanso config directory (macOS / Linux / Windows paths differ)
- Backup existing file to `.backup` before overwriting
- Call `espanso restart` after copying to apply changes

## Tech Stack

- Python 3.8+
- `PyYAML` for YAML serialization (custom Dumper needed for `|-` block scalars)
- Standard library `json` for reading the source file
- No other runtime dependencies

## Documentation & Workflow Rules

- **Next Step**: The immediate development focus is documented in `next_step.md` at the root.
- **Archive**: Completed feature descriptions or historical plans are moved to the `archive/` folder.
- **Naming Convention**: Archived files must be prefixed with a 4-digit sequence (e.g., `archive/0001_mvp_plan.md`).
- **Persistence**: Always update `next_step.md` when a task is completed, and move the old one to `archive/` with the next incremented number.
