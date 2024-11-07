from collections import OrderedDict
from pathlib import Path
from typing import List, Optional

import yaml


class _LiteralStr(str):
    """Marker type that forces YAML block-literal style (`|-`)."""


def _literal_representer(dumper: yaml.Dumper, data: "_LiteralStr") -> yaml.ScalarNode:
    return dumper.represent_scalar("tag:yaml.org,2002:str", data, style="|")


def _ordered_dict_representer(dumper: yaml.Dumper, data: OrderedDict) -> yaml.MappingNode:
    return dumper.represent_mapping("tag:yaml.org,2002:map", data.items())


class _EspansoDumper(yaml.Dumper):
    pass


_EspansoDumper.add_representer(_LiteralStr, _literal_representer)
_EspansoDumper.add_representer(OrderedDict, _ordered_dict_representer)


def _make_match(snippet: dict, snippets_dir: Optional[Path]) -> OrderedDict:
    match: OrderedDict = OrderedDict()
    match["trigger"] = snippet["trigger"]

    if "include_file" in snippet:
        abs_path = str((snippets_dir / snippet["include_file"]).resolve())
        source_name = Path(snippet["include_file"]).name

        match["replace"] = "{{output}}"
        # Two-var pattern: echo stores path (handles spaces), shell executes cat.
        match["vars"] = [
            OrderedDict([
                ("name", "path"),
                ("type", "echo"),
                ("params", OrderedDict([("echo", abs_path)])),
            ]),
            OrderedDict([
                ("name", "output"),
                ("type", "shell"),
                ("params", OrderedDict([("cmd", 'cat "{{path}}"')])),
            ]),
        ]
        # Auto-description so maintainers can identify the source file at a glance.
        # Explicit description in the JSON always takes precedence.
        match["description"] = snippet.get("description") or f"[source: {source_name}]"
    else:
        replace = snippet["replace"].rstrip("\n")
        match["replace"] = _LiteralStr(replace) if "\n" in replace else replace
        if "description" in snippet:
            match["description"] = snippet["description"]

    return match


def generate(snippets: List[dict], output_path: Path, snippets_dir: Optional[Path] = None) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)

    matches = [_make_match(s, snippets_dir) for s in snippets]
    data = OrderedDict([("matches", matches)])

    yaml_str = yaml.dump(
        data,
        Dumper=_EspansoDumper,
        allow_unicode=True,
        default_flow_style=False,
        indent=2,
        sort_keys=False,
    )
    output_path.write_text(yaml_str, encoding="utf-8")
