from pathlib import Path
import json

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="Espanso Snippet Viewer")

ROOT = Path(__file__).parent.parent
SNIPPETS_DIR = ROOT / "snippets"
STATIC_DIR = Path(__file__).parent / "static"


def _find_configs():
    configs = []
    for p in sorted(SNIPPETS_DIR.rglob("*.json")):
        if any(s in p.name for s in (".backup", ".bak", "pre-multi")):
            continue
        try:
            with p.open(encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict) and "snippets" in data:
                configs.append((p, data))
        except Exception:
            pass
    return configs


@app.get("/api/snippets")
def get_snippets():
    files = []
    for config_path, data in _find_configs():
        rel = config_path.relative_to(SNIPPETS_DIR)
        config_dir_rel = rel.parent

        snippets = []
        for snippet in data.get("snippets", []):
            s = dict(snippet)
            if "include_file" in snippet:
                s["resource_path"] = (config_dir_rel / snippet["include_file"]).as_posix()
            snippets.append(s)

        files.append({"path": rel.as_posix(), "snippets": snippets})

    return {"files": files}


@app.get("/api/raw/{file_path:path}")
def get_raw(file_path: str):
    target = (SNIPPETS_DIR / file_path).resolve()
    if not str(target).startswith(str(SNIPPETS_DIR.resolve())):
        raise HTTPException(status_code=403, detail="Access denied")
    if not target.exists():
        raise HTTPException(status_code=404, detail="File not found")
    content = target.read_text(encoding="utf-8")
    return {"content": content, "type": target.suffix.lower().lstrip("."), "name": target.name}


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
