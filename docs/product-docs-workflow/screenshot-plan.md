# Screenshot Automation Plan

This plan describes how to generate product documentation screenshots from fixed product states.

## Goal

Create repeatable screenshots for the leaf nodes in `feature-tree.md`. Screenshots must use synthetic data, avoid personal Espanso files, and stay stable across documentation updates.

## Implemented Pipeline

```text
screenshot manifest
  -> start Vite in documentation screenshot mode
  -> mock Tauri APIs with synthetic Espanso fixture data
  -> drive the real React app UI with Playwright
  -> navigate to a named product state
  -> wait for a stable selector
  -> save PNG to docs/product/assets/screenshots/
  -> validate screenshot files and Markdown references
```

## Source Of Truth

Use `docs/product-docs-workflow/screenshot-manifest.json` as the source of truth for screenshots. Each entry maps one feature-tree leaf node to:

- output image path
- viewport or app window size
- fixture scenario
- scripted UI steps
- stable wait condition
- optional crop target

## Screenshot Harness Options

### Option A: Playwright + Vite App UI Harness

Run:

```bash
npm run docs:screenshots
```

This is the fast development path. It starts the same React application UI in Vite, aliases Tauri APIs to a documentation-only in-memory fixture, and captures screenshots with Playwright.

For final documentation captures, run:

```bash
npm run docs:screenshots:fresh
```

This first rebuilds the documentation screenshot frontend bundle, serves the freshly built `dist-gui/` output with Vite preview, and then captures screenshots from that built output.

The harness captures every manifest entry in English and Simplified Chinese. Output filenames append the locale before `.png`, for example `settings[en].png` and `settings[zh].png`.

Why this is the best first option:

- It is fast enough to run repeatedly while adjusting documentation structure.
- It uses the real app UI components and workflows.
- It avoids personal Espanso data.
- It avoids the current embedded WebDriver startup issue in the Tauri E2E layer.

Tradeoff:

- It does not include the native Tauri window shell.
- Native file dialogs and OS-level behavior are represented by mocks.

### Option B: Extend The Existing WDIO/Tauri E2E Runner

Use the current `npm run test:e2e` infrastructure and the screenshot spec.

Command:

```bash
npm run docs:screenshots:tauri
```

This command can later run:

```bash
npm run build:e2e
wdio run e2e/wdio.screenshots.conf.ts
```

Why this is useful later:

- The app already has Tauri E2E wiring.
- Existing fixtures already avoid personal Espanso data.
- WDIO can interact with the real desktop app.
- Screenshots will reflect the actual installed UI, not a mocked React component.

Current limitation:

- The embedded `tauri-plugin-wdio-webdriver` server did not become ready during local verification. Keep this path available, but do not block documentation screenshots on it.

## Fixture Requirements

The current E2E fixture has two simple snippets. Documentation screenshots need a richer, still synthetic fixture:

```text
match/
  base.yml
  work.yml
  writing/
    email.yml
    meetings.yml
  media/
    images.yml
```

Recommended snippet examples:

- `:hello` -> short greeting
- `:sig` -> email signature
- `:addr` -> synthetic office address
- `:date` -> date variable example
- `:meeting` -> meeting note template
- `:logo` -> synthetic image path
- `:bio` -> external file example
- `:form-intro` -> form snippet example

All paths and text must be synthetic and safe for public screenshots.

## Stable Selectors

The screenshot harness should prefer stable selectors over visible text when possible. Add `data-testid` values only where needed for documentation automation.

Recommended selectors:

- `app-workspace`
- `collection-pane`
- `config-detail`
- `snippet-row`
- `snippet-edit-dialog`
- `search-dialog`
- `settings-dialog`
- `warnings-dialog`
- `trigger-conflicts-dialog`
- `visual-yaml-editor-dialog`
- `import-alfred-dialog`

Visible text can still be used for buttons when labels are stable and user-facing.

## Screenshot Style Rules

- Use one primary desktop size first: `1440x960`.
- Use English UI for first-pass screenshots unless the target documentation is Chinese-only.
- Use the same app theme across all screenshots.
- Avoid showing absolute paths in cropped screenshots unless the path is synthetic.
- Capture full app window for orientation pages.
- Capture dialog-centered screenshots for modal workflows.
- Keep screenshots unannotated; add explanations in documentation text.

## Implementation Steps

1. Add `npm run docs:check` to verify that every manifest output exists.
2. Add more manifest entries for the remaining feature-tree leaves.
3. Add optional crop support for dialog-only images.
4. Revisit `npm run docs:screenshots:tauri` after the embedded WebDriver startup issue is resolved.

## Risks

- Tauri desktop screenshot automation may be slower than component screenshots.
- Some dialogs require native file selection; those states should be scripted with synthetic fixture data or test-only hooks instead of opening native dialogs.
- Absolute paths may differ by machine; documentation fixtures should keep public-facing paths short or crop path-heavy areas.
- Visual changes will require screenshot review. This is expected and should be treated like updating product docs.

## Recommendation

Start with Option A and the recommended first screenshot set. Once the docs structure is stable, add Option B only for states that are cumbersome to reach in the real desktop app.
