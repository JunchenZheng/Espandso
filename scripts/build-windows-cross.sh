#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${WINDOWS_TARGET:-x86_64-pc-windows-msvc}"
BUNDLE="${WINDOWS_BUNDLE:-nsis}"

cd "$ROOT_DIR"

for llvm_bin in /opt/homebrew/opt/llvm/bin /usr/local/opt/llvm/bin; do
  if [[ -x "$llvm_bin/llvm-rc" ]]; then
    export PATH="$llvm_bin:$PATH"
    break
  fi
done

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: Required command '$1' was not found in PATH." >&2
    case "$1" in
      cargo-xwin)
        echo "Install it with: cargo install --locked cargo-xwin" >&2
        ;;
      makensis)
        echo "Install it with: brew install nsis" >&2
        ;;
      llvm-rc)
        echo "Install it with: brew install llvm" >&2
        echo "Then add Homebrew LLVM to PATH, for example: export PATH=\"/opt/homebrew/opt/llvm/bin:\$PATH\"" >&2
        ;;
    esac
    return 1
  fi
}

require_command node
require_command npm
require_command cargo
require_command rustup
require_command cargo-xwin
require_command makensis
require_command llvm-rc

if [[ "${SKIP_NPM_INSTALL:-0}" != "1" ]]; then
  echo "Installing npm dependencies..."
  npm ci
fi

if ! rustup target list --installed | grep -qx "$TARGET"; then
  echo "Installing Rust target $TARGET..."
  rustup target add "$TARGET"
fi

echo "Generating Tauri icons..."
npm run generate:icons

echo "Building Windows $BUNDLE bundle for $TARGET with cargo-xwin..."
npm run tauri -- build --runner cargo-xwin --target "$TARGET" --bundles "$BUNDLE"

echo ""
echo "Windows bundle output:"
echo "  src-tauri/target/$TARGET/release/bundle/$BUNDLE/"
