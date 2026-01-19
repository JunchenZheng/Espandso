# E2E Testing

Expandso's E2E layer is intentionally thin. It launches a debug Tauri build with a temporary
Espanso config directory and covers the highest-frequency full-app workflows:

- display the collection and snippet list
- add a static text snippet and verify the YAML file is written
- batch delete selected snippets and verify the YAML file is updated

Run it with:

```bash
npm run test:e2e
```

The runner uses WebdriverIO with `@wdio/tauri-service` and the embedded WebDriver provider. The
E2E build enables the Cargo `e2e` feature, which registers the WDIO-only Tauri plugins. Production
builds do not enable this feature.

The fixture lives under `e2e/.tmp/` and is recreated by `e2e/wdio.conf.ts`. A fake `espanso`
executable is prepended to `PATH` so the app resolves `espanso path` to the temporary fixture
instead of reading personal Espanso match files.

Current macOS note: the first implementation compiles and launches the debug app, but the local
embedded WebDriver server did not become ready on port `4445` during verification. If that repeats,
check the WDIO/Tauri service logs under `logs/` and the compatibility between `@wdio/tauri-service`,
`tauri-plugin-wdio`, and `tauri-plugin-wdio-webdriver`.
