#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIN_NODE_MAJOR="${MIN_NODE_MAJOR:-20}"
FORCE_NPM_INSTALL="${FORCE_NPM_INSTALL:-0}"
CHECK_ONLY=0
SKIP_PROJECT_INSTALL=0
PACKAGE_MANAGER="npm"
DEPENDENCY_STAMP="$ROOT_DIR/node_modules/.expandso-dependencies.sha256"

usage() {
  cat <<'EOF'
Usage: scripts/setup_npm_env.sh [options]

Checks Node.js/npm and installs project npm dependencies.

Options:
  --check-only           Only check tools; do not install anything.
  --force-project-install
                         Always run npm install/npm ci.
  --skip-project-install Do not run npm install/npm ci.
  -h, --help             Show this help.

Environment:
  MIN_NODE_MAJOR=20      Minimum supported Node.js major version.
  FORCE_NPM_INSTALL=1    Always run npm install/npm ci.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --check-only)
      CHECK_ONLY=1
      ;;
    --force-project-install)
      FORCE_NPM_INSTALL=1
      ;;
    --skip-project-install)
      SKIP_PROJECT_INSTALL=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

node_major_version() {
  node -p "Number(process.versions.node.split('.')[0])"
}

install_node_with_brew() {
  if ! command_exists brew; then
    cat >&2 <<'EOF'
Node.js/npm are not installed, and Homebrew was not found.

Install Homebrew first:
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

Then rerun:
  scripts/setup_npm_env.sh
EOF
    exit 1
  fi

  if [ "$CHECK_ONLY" -eq 1 ]; then
    echo "Node.js/npm are missing. Homebrew is available and can install node."
    return
  fi

  echo "Installing Node.js with Homebrew..."
  brew install node
}

dependency_manifest_hash() {
  cd "$ROOT_DIR"

  if ! command_exists shasum; then
    echo "shasum is required to cache npm dependency state." >&2
    exit 1
  fi

  if [ -f package-lock.json ]; then
    shasum -a 256 package.json package-lock.json
  else
    shasum -a 256 package.json
  fi
}

dependencies_are_current() {
  if [ "$FORCE_NPM_INSTALL" = "1" ]; then
    return 1
  fi

  if [ ! -d "$ROOT_DIR/node_modules" ]; then
    return 1
  fi

  if [ ! -f "$DEPENDENCY_STAMP" ]; then
    echo "Project dependencies: node_modules exists; creating dependency cache stamp."
    dependency_manifest_hash > "$DEPENDENCY_STAMP"
    return 0
  fi

  local current
  current="$(dependency_manifest_hash)"

  local cached
  cached="$(cat "$DEPENDENCY_STAMP")"

  [ "$current" = "$cached" ]
}

write_dependency_stamp() {
  dependency_manifest_hash > "$DEPENDENCY_STAMP"
}

ensure_node_and_npm() {
  if ! command_exists node || ! command_exists npm; then
    install_node_with_brew
  fi

  if ! command_exists node || ! command_exists npm; then
    echo "Node.js/npm are still unavailable after install attempt." >&2
    exit 1
  fi

  local major
  major="$(node_major_version)"
  if [ "$major" -lt "$MIN_NODE_MAJOR" ]; then
    cat >&2 <<EOF
Node.js $(node -v) is too old. This project expects Node.js ${MIN_NODE_MAJOR}+.

Upgrade with Homebrew:
  brew upgrade node

Or install a newer Node.js from:
  https://nodejs.org/
EOF
    exit 1
  fi

  echo "Node: $(node -v)"
  echo "npm:  $(npm -v)"
}

install_project_dependencies() {
  if [ "$SKIP_PROJECT_INSTALL" -eq 1 ]; then
    echo "Skipping project dependency install."
    return
  fi

  if [ "$CHECK_ONLY" -eq 1 ]; then
    if [ -d "$ROOT_DIR/node_modules" ]; then
      echo "Project dependencies: node_modules exists."
    else
      echo "Project dependencies: node_modules is missing."
    fi
    return
  fi

  cd "$ROOT_DIR"

  if dependencies_are_current; then
    echo "Project dependencies: package manifests unchanged; skipping npm install."
    return
  fi

  if [ -f package-lock.json ]; then
    echo "Installing project dependencies with npm ci..."
    "$PACKAGE_MANAGER" ci
  else
    echo "Installing project dependencies with npm install..."
    "$PACKAGE_MANAGER" install
  fi

  write_dependency_stamp
}

ensure_node_and_npm
install_project_dependencies

echo "npm environment is ready."
