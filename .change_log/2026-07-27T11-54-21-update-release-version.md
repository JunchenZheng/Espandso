## Summary

- Updated the application release version to 0.4.0 across frontend, Tauri, npm, and Cargo metadata.
- Replaced the hardcoded About dialog version with a shared frontend version constant.

## Files Changed

- `package.json`
- `package-lock.json`
- `src/version.ts`
- `src/components/AboutDialog.tsx`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock`

## Validation

- Ran `npm run build`.
- Ran `./install_tauri_app.sh`, which built, installed, and launched `/Applications/Expandso.app`.

## Follow-up

- None.
