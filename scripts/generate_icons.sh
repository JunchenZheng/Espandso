#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HASH_FILE="$ROOT_DIR/src-tauri/.icon_hash"
cd "$ROOT_DIR"

INPUT_FILE="${1:-}"

if [ -z "$INPUT_FILE" ]; then
  if [ -f "$ROOT_DIR/icon.svg" ]; then
    INPUT_FILE="$ROOT_DIR/icon.svg"
  elif [ -f "$ROOT_DIR/logo.svg" ]; then
    INPUT_FILE="$ROOT_DIR/logo.svg"
  elif [ -f "$ROOT_DIR/icon.png" ]; then
    INPUT_FILE="$ROOT_DIR/icon.png"
  elif [ -f "$ROOT_DIR/logo.png" ]; then
    INPUT_FILE="$ROOT_DIR/logo.png"
  else
    echo "Error: Source icon file not found! Place icon.svg, logo.svg, or icon.png in the project root or specify an input file path." >&2
    echo "Usage: ./scripts/generate_icons.sh [source-image-path]" >&2
    exit 1
  fi
fi

if [ ! -f "$INPUT_FILE" ]; then
  echo "Error: Specified source file does not exist: $INPUT_FILE" >&2
  exit 1
fi

echo "Generating icons in src-tauri/icons from source icon file '$INPUT_FILE'..."
npm run tauri -- icon "$INPUT_FILE"

# Record hash of current source icon file
if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$INPUT_FILE" | awk '{print $1}' > "$HASH_FILE"
elif command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$INPUT_FILE" | awk '{print $1}' > "$HASH_FILE"
fi

echo ""
echo "✅ Icon assets updated successfully in src-tauri/icons/!"
echo "Run ./install_tauri_app.sh to rebuild and install the desktop app with the new icon."
