#!/usr/bin/env python3
"""
Migrate legacy Espanso YAML configs to multi-JSON format under snippets/.

Output structure mirrors the source YAML directory layout:
    match/anki/anki_active/active.yml  →  snippets/anki/anki_active/active.json
    match/anki/anki_active/active.json →  snippets/anki/anki_active/active_data.json

Rules:
  - Each YAML file → one JSON config file (same relative path, .yml → .json)
  - JSON resource files: renamed with _data suffix to avoid clash with the config
  - .md / .txt resource files: keep original filename
  - include_file path is relative to the config JSON's own directory (Plan A)
  - Duplicate triggers across files: second occurrence skipped with a warning

Skipped with a warning:
  - date / non-cat shell vars
  - Matches whose referenced file does not exist
  - Fully commented-out YAML (no matches key)

Usage:
    python tools/migrate_legacy.py [--match-dir PATH] [--dry-run] [--clean-snippets]
"""

import argparse
import json
import platform
import re
import shutil
import sys
from pathlib import Path
from typing import Optional

import yaml

ROOT = Path(__file__).parent.parent
SNIPPETS_DIR = ROOT / "snippets"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def default_match_dir() -> Path:
    os_name = platform.system()
    if os_name == "Darwin":
        return Path.home() / "Library" / "Application Support" / "espanso" / "match"
    if os_name == "Linux":
        return Path.home() / ".config" / "espanso" / "match"
    if os_name == "Windows":
        return Path.home() / "AppData" / "Roaming" / "espanso" / "match"
    print(f"error: unsupported OS '{os_name}'", file=sys.stderr)
    sys.exit(1)


def find_yaml_files(match_dir: Path) -> list:
    return sorted(
        p for p in match_dir.rglob("*.yml")
        if ".idea" not in p.parts
    )


def _resource_filename(src: Path) -> str:
    """
    Choose the filename for a copied resource.
    JSON files get a _data suffix to avoid colliding with the config JSON.
    Other formats (.md, .txt, …) keep their original name.
    """
    if src.suffix.lower() == ".json":
        return src.stem + "_data" + src.suffix
    return src.name


# ---------------------------------------------------------------------------
# Var-block analysis
# ---------------------------------------------------------------------------

def _extract_cat_path(vars_block: list) -> Optional[str]:
    echo_path: Optional[str] = None
    shell_cmd: Optional[str] = None

    for var in vars_block:
        vtype = var.get("type", "")
        params = var.get("params") or {}
        if vtype == "echo":
            echo_path = params.get("echo")
        elif vtype == "shell":
            shell_cmd = params.get("cmd", "")

    if echo_path:
        return echo_path
    if shell_cmd:
        m = re.search(r'cat\s+"([^"]+)"', shell_cmd)
        if m:
            return m.group(1)
    return None


def _only_cat_var_types(vars_block: list) -> bool:
    allowed = {"echo", "shell"}
    return all(var.get("type", "") in allowed for var in vars_block)


# ---------------------------------------------------------------------------
# Single-match parser
# ---------------------------------------------------------------------------

def parse_match(match: dict, yaml_path: Path, match_dir: Path) -> tuple:
    """
    Returns (entries, warnings).
    Each entry: {_snippet, optionally _resource_src (Path)}
    """
    if "triggers" in match:
        raw = match["triggers"]
        triggers = list(raw) if isinstance(raw, list) else [raw]
    elif "trigger" in match:
        triggers = [match["trigger"]]
    else:
        return [], [f"{yaml_path.name}: match has no trigger, skipping"]

    triggers = [str(t) for t in triggers]
    vars_block = match.get("vars") or []
    warnings = []

    if vars_block:
        if not _only_cat_var_types(vars_block):
            bad = [v.get("type") for v in vars_block if v.get("type") not in {"echo", "shell"}]
            return [], [f"{yaml_path.name}: {triggers} has unsupported var type(s) {bad}, skipping"]

        cat_path = _extract_cat_path(vars_block)
        if not cat_path:
            return [], [f"{yaml_path.name}: {triggers} has shell var but no cat command, skipping"]

        ref_path = Path(cat_path)
        if not ref_path.exists():
            return [], [f"{yaml_path.name}: {triggers} references missing file '{cat_path}', skipping"]

        resource_filename = _resource_filename(ref_path)

        entries = []
        for trigger in triggers:
            snippet = {"trigger": trigger, "include_file": resource_filename}
            if match.get("description"):
                snippet["description"] = match["description"]
            entries.append({"_snippet": snippet, "_resource_src": ref_path})
        return entries, warnings

    replace = match.get("replace")
    if replace is None:
        return [], [f"{yaml_path.name}: {triggers} has no replace, skipping"]

    entries = []
    for trigger in triggers:
        snippet = {"trigger": trigger, "replace": str(replace)}
        if match.get("description"):
            snippet["description"] = match["description"]
        entries.append({"_snippet": snippet})
    return entries, warnings


# ---------------------------------------------------------------------------
# Clean-up helpers
# ---------------------------------------------------------------------------

def clean_snippets_dir() -> None:
    """Remove old single-file artifacts before writing the new multi-file layout."""
    removed = []

    old_json = SNIPPETS_DIR / "snippets.json"
    if old_json.exists():
        backup = SNIPPETS_DIR / "snippets.json.pre-multi.bak"
        shutil.copy2(old_json, backup)
        old_json.unlink()
        removed.append(f"snippets.json (backed up → {backup.name})")

    old_backup = SNIPPETS_DIR / "snippets.json.backup"
    if old_backup.exists():
        old_backup.unlink()
        removed.append("snippets.json.backup")

    old_resources = SNIPPETS_DIR / "resources"
    if old_resources.exists():
        shutil.rmtree(old_resources)
        removed.append("resources/")

    if removed:
        print("Cleaned up old single-file artifacts:")
        for r in removed:
            print(f"  removed {r}")
        print()


# ---------------------------------------------------------------------------
# Core migration
# ---------------------------------------------------------------------------

def migrate(match_dir: Path, dry_run: bool = False, clean: bool = False) -> None:
    if clean and not dry_run:
        clean_snippets_dir()

    yaml_files = find_yaml_files(match_dir)
    print(f"Scanning {len(yaml_files)} YAML files in:\n  {match_dir}\n")

    # yaml_path → list of entries for that file
    yaml_groups: dict = {}
    warnings: list = []
    seen_triggers: dict = {}  # trigger → first yaml filename

    for yaml_path in yaml_files:
        try:
            with yaml_path.open(encoding="utf-8") as f:
                data = yaml.safe_load(f)
        except Exception as exc:
            warnings.append(f"{yaml_path.name}: parse error — {exc}")
            continue

        if not data or "matches" not in data:
            continue

        group = []
        for match in data["matches"]:
            entries, w = parse_match(match, yaml_path, match_dir)
            warnings.extend(w)
            for entry in entries:
                trigger = entry["_snippet"]["trigger"]
                if trigger in seen_triggers:
                    warnings.append(
                        f"duplicate trigger '{trigger}' "
                        f"(first in {seen_triggers[trigger]}, also in {yaml_path.name}), skipping"
                    )
                    continue
                seen_triggers[trigger] = yaml_path.name
                group.append(entry)

        if group:
            yaml_groups[yaml_path] = group

    total_snippets = sum(len(g) for g in yaml_groups.values())
    total_resources = sum(
        1 for g in yaml_groups.values()
        for e in g if "_resource_src" in e
    )

    print(f"Results:")
    print(f"  {len(yaml_groups)} JSON files  |  "
          f"{total_snippets} snippets  |  "
          f"{total_resources} external files  |  "
          f"{len(warnings)} warnings")

    if warnings:
        print(f"\nWarnings:")
        for w in warnings:
            print(f"  ! {w}")

    if dry_run:
        print("\n[dry-run] No files written. Preview:\n")
        for yaml_path, group in yaml_groups.items():
            rel = yaml_path.relative_to(match_dir)
            config_rel = Path("snippets") / rel.with_suffix(".json")
            print(f"  [{config_rel}]")
            for entry in group:
                s = entry["_snippet"]
                if "include_file" in s:
                    print(f"    {s['trigger']:<22} → include_file: {s['include_file']}")
                else:
                    r = s.get("replace", "").replace("\n", "↵")[:50]
                    print(f"    {s['trigger']:<22} → {r}")
        return

    # --- write files ---
    print("\nWriting JSON configs and copying resources:")
    for yaml_path, group in yaml_groups.items():
        rel = yaml_path.relative_to(match_dir)           # e.g. anki/anki_active/active.yml
        config_path = SNIPPETS_DIR / rel.with_suffix(".json")
        config_dir = config_path.parent
        config_dir.mkdir(parents=True, exist_ok=True)

        # Deduplicate resources within this config (same src → same dst)
        copied: set = set()
        snippets = []
        for entry in group:
            snippet = dict(entry["_snippet"])
            if "_resource_src" in entry:
                src: Path = entry["_resource_src"]
                dst = config_dir / snippet["include_file"]
                if str(dst) not in copied:
                    shutil.copy2(src, dst)
                    copied.add(str(dst))
            snippets.append(snippet)

        output = {"version": 1, "snippets": snippets}
        with config_path.open("w", encoding="utf-8") as f:
            json.dump(output, f, ensure_ascii=False, indent=2)

        config_short = config_path.relative_to(ROOT)
        print(f"  {config_short}  ({len(snippets)} snippets)")

    print(f"\nDone. Run `python build.py` to generate YAML.")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Migrate legacy Espanso YAML configs to multi-JSON format"
    )
    parser.add_argument("--match-dir", type=Path, default=None,
                        help="Espanso match directory (defaults to OS-specific path)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Preview without writing any files")
    parser.add_argument("--clean-snippets", action="store_true",
                        help="Remove old single-file artifacts (snippets.json, resources/) first")
    args = parser.parse_args()

    match_dir = args.match_dir or default_match_dir()
    if not match_dir.exists():
        print(f"error: match directory not found: {match_dir}", file=sys.stderr)
        sys.exit(1)

    migrate(match_dir, dry_run=args.dry_run, clean=args.clean_snippets)


if __name__ == "__main__":
    main()
