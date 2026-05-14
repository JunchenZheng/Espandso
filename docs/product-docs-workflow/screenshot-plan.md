# Screenshot Automation Plan

This plan describes how to generate product documentation screenshots from fixed product states.

## Goal

Create repeatable screenshots for the leaf nodes in `feature-tree.md`. Screenshots must use synthetic data, avoid personal Espanso files, and stay stable across documentation updates.

## Proposed Pipeline

```text
screenshot manifest
  -> seed synthetic Espanso fixture
  -> build or launch E2E Tauri app
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

### Option A: Extend The Existing WDIO/Tauri E2E Runner

Use the current `npm run test:e2e` infrastructure and add a separate screenshot spec.

Recommended command shape:

```bash
npm run docs:screenshots
```

This command can later run:

```bash
npm run build:e2e
wdio run e2e/wdio.screenshots.conf.ts
```

Why this is the best first option:

- The app already has Tauri E2E wiring.
- Existing fixtures already avoid personal Espanso data.
- WDIO can interact with the real desktop app.
- Screenshots will reflect the actual installed UI, not a mocked React component.

### Option B: Browser-Only Vite Screenshot Harness

Launch the Vite frontend and mock Tauri APIs in a documentation-only route.

Why this is useful later:

- Faster than launching the desktop app.
- Easier to force specific states such as warning dialogs and import previews.
- Good for high-volume screenshot generation.

Tradeoff:

- It is less faithful to the real desktop shell and native integrations.

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

1. Add `e2e/helpers/docsFixture.ts` with richer synthetic YAML files.
2. Add `e2e/helpers/screenshotManifest.ts` to load and validate the manifest.
3. Add `e2e/specs/docs-screenshots.e2e.ts`.
4. Add `e2e/wdio.screenshots.conf.ts` that uses the docs fixture.
5. Add `npm run docs:screenshots`.
6. Add `npm run docs:check` to verify that every manifest output exists.

## Risks

- Tauri desktop screenshot automation may be slower than component screenshots.
- Some dialogs require native file selection; those states should be scripted with synthetic fixture data or test-only hooks instead of opening native dialogs.
- Absolute paths may differ by machine; documentation fixtures should keep public-facing paths short or crop path-heavy areas.
- Visual changes will require screenshot review. This is expected and should be treated like updating product docs.

## Recommendation

Start with Option A and the recommended first screenshot set. Once the docs structure is stable, add Option B only for states that are cumbersome to reach in the real desktop app.
