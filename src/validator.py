import sys
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional


@dataclass
class ValidationError:
    message: str


def validate(data: dict, snippets_dir: Optional[Path] = None) -> List[ValidationError]:
    errors: List[ValidationError] = []

    if not isinstance(data.get("version"), int):
        errors.append(ValidationError("root 'version' must be an integer"))

    snippets = data.get("snippets")
    if not isinstance(snippets, list):
        errors.append(ValidationError("root 'snippets' must be a list"))
        return errors

    seen_triggers: dict = {}

    for i, snippet in enumerate(snippets):
        trigger = snippet.get("trigger")
        replace = snippet.get("replace")
        include_file = snippet.get("include_file")

        if not isinstance(trigger, str) or not trigger:
            errors.append(ValidationError(f"snippet #{i}: 'trigger' must be a non-empty string"))
        else:
            if trigger in seen_triggers:
                errors.append(ValidationError(
                    f"snippet #{i}: duplicate trigger '{trigger}' (first at #{seen_triggers[trigger]})"
                ))
            else:
                seen_triggers[trigger] = i
                if not trigger.startswith(":"):
                    print(
                        f"warning: snippet #{i}: trigger '{trigger}' does not start with ':'",
                        file=sys.stderr,
                    )

        has_replace = replace is not None
        has_include = include_file is not None

        if not has_replace and not has_include:
            errors.append(ValidationError(f"snippet #{i}: must have either 'replace' or 'include_file'"))
        elif has_replace and has_include:
            errors.append(ValidationError(f"snippet #{i}: cannot have both 'replace' and 'include_file'"))
        elif has_replace:
            if not isinstance(replace, str) or not replace:
                errors.append(ValidationError(f"snippet #{i}: 'replace' must be a non-empty string"))
        else:
            if not isinstance(include_file, str) or not include_file:
                errors.append(ValidationError(f"snippet #{i}: 'include_file' must be a non-empty string"))
            elif snippets_dir is not None:
                ref_path = (snippets_dir / include_file).resolve()
                if not ref_path.exists():
                    errors.append(ValidationError(
                        f"snippet #{i}: include_file '{include_file}' not found at {ref_path}"
                    ))
                elif not ref_path.is_file():
                    errors.append(ValidationError(
                        f"snippet #{i}: include_file '{include_file}' is not a file"
                    ))

        desc = snippet.get("description")
        if desc is not None and not isinstance(desc, str):
            errors.append(ValidationError(f"snippet #{i}: 'description' must be a string"))

    return errors
