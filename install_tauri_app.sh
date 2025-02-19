#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FAST_BUILD="${FAST_BUILD:-1}"
CONFIGURATION="${CONFIGURATION:-}"
if [ -z "$CONFIGURATION" ]; then
  if [ "$FAST_BUILD" = "1" ]; then
    CONFIGURATION="debug"
  else
    CONFIGURATION="release"
  fi
fi
DEST_DIR="${1:-/Applications}"
APP_NAME="${APP_NAME:-Expandso.app}"
BUILT_APP_PATH="$ROOT_DIR/src-tauri/target/$CONFIGURATION/bundle/macos/$APP_NAME"
DEST_APP_PATH="$DEST_DIR/$APP_NAME"
SKIP_NPM_SETUP="${SKIP_NPM_SETUP:-0}"
NO_SIGN="${NO_SIGN:-0}"

usage() {
  cat <<'EOF'
Usage: ./install_tauri_app.sh [destination-dir]

Builds the Tauri macOS .app bundle and installs it locally.

Defaults:
  destination-dir        /Applications
  build mode             fast debug build

Environment:
  CONFIGURATION=debug    Tauri/Rust build profile to install from.
                         Use CONFIGURATION=release for full release builds.
  FAST_BUILD=1           Use debug, skip signing, and run Vite without tsc.
                         Set FAST_BUILD=0 for the full release install path.
  APP_NAME=Expandso.app Expected .app bundle name.
  FORCE_NPM_INSTALL=1    Force scripts/setup_npm_env.sh to reinstall npm dependencies.
  NO_SIGN=1              Pass --no-sign to tauri build.
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
  local tauri_args
  tauri_args=(build --bundles app)

  if [ "$CONFIGURATION" = "debug" ]; then
    tauri_args+=(--debug)
  fi

  if [ "$FAST_BUILD" = "1" ]; then
    tauri_args+=(--config '{"build":{"beforeBuildCommand":"npm run build:frontend"}}')
    NO_SIGN=1
  fi

  if [ "$NO_SIGN" = "1" ]; then
    tauri_args+=(--no-sign)
  fi

  echo "Building Tauri app ($CONFIGURATION)..."
  npm run tauri -- "${tauri_args[@]}"
}

app_process_name() {
  local plist_path=""

  if [ -f "$DEST_APP_PATH/Contents/Info.plist" ]; then
    plist_path="$DEST_APP_PATH/Contents/Info.plist"
  elif [ -f "$BUILT_APP_PATH/Contents/Info.plist" ]; then
    plist_path="$BUILT_APP_PATH/Contents/Info.plist"
  fi

  if [ -n "$plist_path" ] && command_exists plutil; then
    local executable_name
    executable_name="$(plutil -extract CFBundleExecutable raw -o - "$plist_path" 2>/dev/null || true)"
    if [ -n "$executable_name" ]; then
      echo "$executable_name"
      return
    fi
  fi

  echo "${APP_NAME%.app}"
}

stop_existing_app() {
  local PROCESS_NAME
  PROCESS_NAME="$(app_process_name)"

  if pgrep -x "$PROCESS_NAME" >/dev/null 2>&1; then
    echo "Stopping existing process $PROCESS_NAME..."
    pkill -x "$PROCESS_NAME" || true

    local attempts=0
    while pgrep -x "$PROCESS_NAME" >/dev/null 2>&1 && [ "$attempts" -lt 10 ]; do
      sleep 0.5
      attempts=$((attempts + 1))
    done

    if pgrep -x "$PROCESS_NAME" >/dev/null 2>&1; then
      echo "Existing process $PROCESS_NAME is still running after stop request." >&2
      exit 1
    fi
  fi
}

install_app() {
  if [ ! -d "$BUILT_APP_PATH" ]; then
    echo "Build finished, but the app bundle was not found at:" >&2
    echo "  $BUILT_APP_PATH" >&2
    echo "Check src-tauri/tauri.conf.json productName or set APP_NAME." >&2
    exit 1
  fi

  stop_existing_app

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

check_and_generate_icons() {
  local HASH_FILE="$ROOT_DIR/src-tauri/.icon_hash"
  local icon_src=""

  if [ -f "$ROOT_DIR/icon.svg" ]; then
    icon_src="$ROOT_DIR/icon.svg"
  elif [ -f "$ROOT_DIR/logo.svg" ]; then
    icon_src="$ROOT_DIR/logo.svg"
  elif [ -f "$ROOT_DIR/icon.png" ]; then
    icon_src="$ROOT_DIR/icon.png"
  elif [ -f "$ROOT_DIR/logo.png" ]; then
    icon_src="$ROOT_DIR/logo.png"
  elif [ -f "$ROOT_DIR/logo.jpg" ]; then
    icon_src="$ROOT_DIR/logo.jpg"
  fi

  if [ -z "$icon_src" ]; then
    echo "未找到源图标文件，跳过图标生成。"
    return
  fi

  local current_hash=""
  if command_exists shasum; then
    current_hash="$(shasum -a 256 "$icon_src" | awk '{print $1}')"
  elif command_exists sha256sum; then
    current_hash="$(sha256sum "$icon_src" | awk '{print $1}')"
  elif command_exists md5; then
    current_hash="$(md5 -q "$icon_src")"
  fi

  local previous_hash=""
  if [ -f "$HASH_FILE" ]; then
    previous_hash="$(cat "$HASH_FILE" 2>/dev/null || true)"
  fi

  if [ -z "$previous_hash" ] || [ "$current_hash" != "$previous_hash" ]; then
    echo "检测到源图标文件 ($icon_src) 变更或未初始化，正在自动重新生成图标..."
    "$ROOT_DIR/scripts/generate_icons.sh" "$icon_src"
  else
    echo "源图标文件未发生变更 (${current_hash:0:8})，跳过图标生成。"
  fi
}

ensure_build_tools
install_npm_environment
check_and_generate_icons
build_tauri_app
install_app
