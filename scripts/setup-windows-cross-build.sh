#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${WINDOWS_TARGET:-x86_64-pc-windows-msvc}"

cd "$ROOT_DIR"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: Required command '$1' was not found in PATH." >&2
    return 1
  fi
}

install_brew_package() {
  local package_name="$1"

  if brew list --versions "$package_name" >/dev/null 2>&1; then
    echo "Homebrew package '$package_name' is already installed."
    return
  fi

  echo "Installing Homebrew package '$package_name'..."
  brew install "$package_name"
}

ensure_llvm_path() {
  for llvm_bin in /opt/homebrew/opt/llvm/bin /usr/local/opt/llvm/bin; do
    if [[ -x "$llvm_bin/llvm-rc" ]]; then
      export PATH="$llvm_bin:$PATH"
      return
    fi
  done

  echo "Error: llvm-rc was not found after installing llvm." >&2
  echo "Add Homebrew LLVM to PATH, for example:" >&2
  echo '  export PATH="/opt/homebrew/opt/llvm/bin:$PATH"' >&2
  return 1
}

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Error: This setup script is intended for macOS cross-building only." >&2
  exit 1
fi

require_command brew
require_command cargo
require_command rustup
require_command npm

install_brew_package nsis
install_brew_package llvm
ensure_llvm_path

if ! command -v cargo-xwin >/dev/null 2>&1; then
  echo "Installing cargo-xwin..."
  cargo install --locked cargo-xwin
else
  echo "cargo-xwin is already installed."
fi

if ! rustup target list --installed | grep -qx "$TARGET"; then
  echo "Installing Rust target $TARGET..."
  rustup target add "$TARGET"
else
  echo "Rust target $TARGET is already installed."
fi

echo ""
echo "Windows cross-build environment is ready."
echo "Run: npm run build:windows"
