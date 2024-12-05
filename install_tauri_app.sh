#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIGURATION="${CONFIGURATION:-release}"
DEST_DIR="${1:-/Applications}"
APP_NAME="${APP_NAME:-Expandso.app}"
BUILT_APP_PATH="$ROOT_DIR/src-tauri/target/$CONFIGURATION/bundle/macos/$APP_NAME"
DEST_APP_PATH="$DEST_DIR/$APP_NAME"
SKIP_NPM_SETUP="${SKIP_NPM_SETUP:-0}"

usage() {
  cat <<'EOF'
Usage: ./install_tauri_app.sh [destination-dir]

Builds the Tauri macOS .app bundle and installs it locally.

Defaults:
  destination-dir        /Applications

Environment:
  CONFIGURATION=release  Tauri/Rust build profile path to install from.
  APP_NAME=Expandso.app Expected .app bundle name.
  SKIP_NPM_SETUP=1       Skip scripts/setup_npm_env.sh.
EOF
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

run_with_privilege() {
  if [ -w "$DEST_DIR" ] || { [ ! -e "$DEST_DIR" ] && [ -w "$(dirname "$DEST_DIR")" ]; }; then
    "$@"
  else
    sudo "$@"
  fi
}

ensure_build_tools() {
  if ! command_exists cargo; then
    cat >&2 <<'EOF'
Rust/Cargo is required to build the Tauri app.

Install Rust:
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

Then open a new terminal and rerun this script.
EOF
    exit 1
  fi

  if ! command_exists xcode-select; then
    echo "xcode-select was not found. Install Xcode Command Line Tools first." >&2
    exit 1
  fi

  if ! xcode-select -p >/dev/null 2>&1; then
    cat >&2 <<'EOF'
Xcode Command Line Tools are not configured.

Install/configure them with:
  xcode-select --install
EOF
    exit 1
  fi
}

install_npm_environment() {
  if [ "$SKIP_NPM_SETUP" = "1" ]; then
    echo "Skipping npm setup."
    return
  fi

  "$ROOT_DIR/scripts/setup_npm_env.sh"
}

build_tauri_app() {
  cd "$ROOT_DIR"
  echo "Building Tauri app..."
  npm run tauri build
}

install_app() {
  if [ ! -d "$BUILT_APP_PATH" ]; then
    echo "Build finished, but the app bundle was not found at:" >&2
    echo "  $BUILT_APP_PATH" >&2
    echo "Check src-tauri/tauri.conf.json productName or set APP_NAME." >&2
    exit 1
  fi

  # Automatically kill old process if running
  local PROCESS_NAME="${APP_NAME%.app}"
  if pgrep -x "$PROCESS_NAME" >/dev/null 2>&1; then
    echo "Stopping existing process $PROCESS_NAME..."
    pkill -x "$PROCESS_NAME" || true
    sleep 1
  fi

  echo "Installing to $DEST_APP_PATH..."
  run_with_privilege mkdir -p "$DEST_DIR"
  run_with_privilege rm -rf "$DEST_APP_PATH"
  run_with_privilege ditto "$BUILT_APP_PATH" "$DEST_APP_PATH"

  echo "Installed:"
  echo "  $DEST_APP_PATH"

  # Automatically launch the newly installed app
  echo "Launching $DEST_APP_PATH..."
  open "$DEST_APP_PATH"
}

ensure_build_tools
install_npm_environment
build_tauri_app
install_app
