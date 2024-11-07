#!/usr/bin/env python3
import argparse
import json
import platform
import shutil
import subprocess
import sys
from pathlib import Path

from src.generator import generate
from src.validator import validate

ROOT = Path(__file__).parent
SNIPPETS_DIR = ROOT / "snippets"
DIST_DIR = ROOT / "dist"


def _espanso_match_dir() -> Path:
    os_name = platform.system()
    if os_name == "Darwin":
        return Path.home() / "Library" / "Application Support" / "espanso" / "match"
    if os_name == "Linux":
        return Path.home() / ".config" / "espanso" / "match"
    if os_name == "Windows":
        return Path.home() / "AppData" / "Roaming" / "espanso" / "match"
    print(f"error: unsupported OS '{os_name}'", file=sys.stderr)
    sys.exit(1)


def _find_configs() -> list:
    """
    Discover snippet config files under snippets/.
    A file is a config if it is a valid JSON object containing a 'snippets' key.
    All other JSON files are treated as resources (data files).
    Backup/bak files are skipped.
    """
    configs = []
    for p in sorted(SNIPPETS_DIR.rglob("*.json")):
        if p.suffixes and any(s in (".backup", ".bak") for s in p.suffixes):
            continue
        try:
            with p.open(encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict) and "snippets" in data:
                configs.append((p, data))
        except Exception:
            pass
    return configs


def _build() -> list:
    """
    Validate and build all snippet configs.
    Returns list of successfully generated dist paths.
    """
    configs = _find_configs()
    if not configs:
        print("error: no snippet config files found under snippets/", file=sys.stderr)
        sys.exit(1)

    any_error = False
    generated = []

    for config_path, data in configs:
        rel = config_path.relative_to(SNIPPETS_DIR)
        snippets_dir = config_path.parent

        errors = validate(data, snippets_dir=snippets_dir)
        if errors:
            print(f"[{rel}]", file=sys.stderr)
            for err in errors:
                print(f"  error: {err.message}", file=sys.stderr)
            any_error = True
            continue

        dist_path = DIST_DIR / rel.with_suffix(".yml")
        generate(data["snippets"], dist_path, snippets_dir=snippets_dir)
        print(f"generated {dist_path.relative_to(ROOT)}")
        generated.append(dist_path)

    if any_error:
        sys.exit(1)

    return generated


def _install() -> None:
    generated = _build()
    match_dir = _espanso_match_dir()
    match_dir.mkdir(parents=True, exist_ok=True)

    for dist_path in generated:
        rel = dist_path.relative_to(DIST_DIR)
        dest = match_dir / rel
        dest.parent.mkdir(parents=True, exist_ok=True)

        if dest.exists():
            backup = dest.with_suffix(".yml.backup")
            shutil.copy2(dest, backup)
            print(f"backed up {rel}")

        shutil.copy2(dist_path, dest)
        print(f"installed {rel}")

    try:
        subprocess.run(["espanso", "restart"], check=True)
        print("espanso restarted")
    except FileNotFoundError:
        print("warning: 'espanso' not found in PATH — restart manually", file=sys.stderr)
    except subprocess.CalledProcessError as exc:
        print(f"warning: espanso restart failed (exit {exc.returncode})", file=sys.stderr)


def _serve() -> None:
    try:
        import uvicorn
    except ImportError:
        print("error: run `pip install 'uvicorn[standard]'` first", file=sys.stderr)
        sys.exit(1)
    print("Snippet viewer → http://127.0.0.1:8765")
    uvicorn.run("src.server:app", host="127.0.0.1", port=8765, reload=True,
                reload_dirs=[str(ROOT / "snippets")])


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build Espanso YAML from snippets/ (multi-file mode)"
    )
    parser.add_argument("--install", action="store_true", help="install to local Espanso")
    parser.add_argument("--serve", action="store_true", help="start local snippet viewer on :8765")
    args = parser.parse_args()

    if args.install:
        _install()
    elif args.serve:
        _serve()
    else:
        _build()


if __name__ == "__main__":
    main()
