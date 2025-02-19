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
  elif [ -f "$ROOT_DIR/logo.jpg" ]; then
    INPUT_FILE="$ROOT_DIR/logo.jpg"
  else
    echo "错误：未找到图标源文件！请在项目根目录下放置 icon.svg、logo.svg、icon.png 或指定输入文件路径。" >&2
    echo "用法: ./scripts/generate_icons.sh [源图片/SVG路径]" >&2
    exit 1
  fi
fi

if [ ! -f "$INPUT_FILE" ]; then
  echo "错误：指定的源文件不存在: $INPUT_FILE" >&2
  exit 1
fi

echo "正在从源图标文件 '$INPUT_FILE' 生成 src-tauri/icons 中的所有图标..."
npm run tauri -- icon "$INPUT_FILE"

# 记录当前源图标文件的 Hash
if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$INPUT_FILE" | awk '{print $1}' > "$HASH_FILE"
elif command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$INPUT_FILE" | awk '{print $1}' > "$HASH_FILE"
fi

echo ""
echo "✅ 图标资源已成功更新至 src-tauri/icons/ 目录！"
echo "你可以运行 ./install_tauri_app.sh 重新编译并安装 Desktop 应用以应用新图标。"
