use rusqlite::{params, Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;
use tauri::Manager;
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SearchScope {
    pub trigger: bool,
    pub description: bool,
    pub content: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchIndexRequest {
    pub match_dir: String,
    pub query: String,
    pub scope: SearchScope,
    pub limit: usize,
    pub offset: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SearchIndexResult {
    pub file_path: String,
    pub file_relative_path: String,
    pub filename: String,
    pub snippet: serde_json::Value,
    pub snippet_index: usize,
    pub original_match_index: usize,
    pub trigger_index: usize,
    pub matched_fields: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SearchIndexStatus {
    pub state: String, // "idle" | "indexing" | "ready" | "error"
    pub indexed_files: usize,
    pub total_files: usize,
    pub indexed_matches: usize,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchIndexResponse {
    pub results: Vec<SearchIndexResult>,
    pub total: usize,
    pub index_status: SearchIndexStatus,
}

#[derive(Debug, Clone)]
pub struct ParsedMatchRow {
    pub display_index: usize,
    pub original_match_index: usize,
    pub trigger_index: usize,
    pub trigger: String,
    pub description: Option<String>,
    pub content: Option<String>,
    pub kind: String,
    pub snippet_json: String,
    pub original_snippet_json: Option<String>,
    pub resource_path: Option<String>,
    pub resource_name: Option<String>,
}

pub struct ParsedYamlFile {
    pub matches: Vec<ParsedMatchRow>,
    pub warnings: Vec<String>,
}

// Global or lazy mutex state for indexer locking if needed
#[allow(dead_code)]
pub struct SearchIndexState(pub Mutex<Option<PathBuf>>);

pub fn resolve_db_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir)
            .map_err(|e| format!("Failed to create app data dir: {}", e))?;
    }
    Ok(app_dir.join("expandso-search-index.sqlite"))
}

pub fn open_and_init_db(db_path: &Path) -> SqlResult<Connection> {
    let conn = Connection::open(db_path)?;
    conn.execute_batch(
        "
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS index_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS indexed_files (
            file_path TEXT PRIMARY KEY,
            relative_path TEXT NOT NULL,
            mtime_ns INTEGER NOT NULL,
            file_size INTEGER NOT NULL,
            snippet_count INTEGER NOT NULL DEFAULT 0,
            warning_count INTEGER NOT NULL DEFAULT 0,
            warnings_json TEXT NOT NULL DEFAULT '[]',
            indexed_at_ms INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS matches (
            id INTEGER PRIMARY KEY,
            file_path TEXT NOT NULL,
            relative_path TEXT NOT NULL,
            filename TEXT NOT NULL,
            display_index INTEGER NOT NULL,
            original_match_index INTEGER NOT NULL,
            trigger_index INTEGER NOT NULL,
            trigger TEXT NOT NULL,
            description TEXT,
            content TEXT,
            kind TEXT NOT NULL,
            snippet_json TEXT NOT NULL,
            original_snippet_json TEXT,
            resource_path TEXT,
            resource_name TEXT,
            FOREIGN KEY(file_path) REFERENCES indexed_files(file_path) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_matches_file_path ON matches(file_path);
        CREATE INDEX IF NOT EXISTS idx_matches_trigger ON matches(trigger);
        CREATE INDEX IF NOT EXISTS idx_matches_original_match
            ON matches(file_path, original_match_index, trigger_index);

        CREATE VIRTUAL TABLE IF NOT EXISTS matches_fts USING fts5(
            trigger,
            description,
            content,
            content='matches',
            content_rowid='id'
        );

        INSERT OR IGNORE INTO index_meta (key, value) VALUES ('schema_version', '1');
        ",
    )?;
    Ok(conn)
}

// Extractor logic matching importYaml.ts
fn get_resource_filename(src_name: &str) -> String {
    let lowercase = src_name.to_lowercase();
    if lowercase.ends_with(".json") {
        let stem = &src_name[..src_name.len() - 5];
        format!("{}_data.json", stem)
    } else {
        src_name.to_string()
    }
}

fn extract_cat_path(vars_block: &[serde_yaml::Value]) -> Option<String> {
    let mut echo_path: Option<String> = None;
    let mut shell_cmd: Option<String> = None;

    for v in vars_block {
        let vtype = v.get("type").and_then(|t| t.as_str()).unwrap_or("");
        let params = v.get("params");
        if vtype == "echo" {
            echo_path = params
                .and_then(|p| p.get("echo"))
                .and_then(|e| e.as_str())
                .map(|s| s.to_string());
        } else if vtype == "shell" {
            shell_cmd = params
                .and_then(|p| p.get("cmd"))
                .and_then(|c| c.as_str())
                .map(|s| s.to_string());
        }
    }

    if let Some(cmd) = shell_cmd {
        // Regex /cat\s+["']?([^"']+)["']?/
        if let Some(cat_idx) = cmd.find("cat") {
            let rest = cmd[cat_idx + 3..].trim();
            let cleaned = rest.trim_matches(|c| c == '\'' || c == '"').trim();
            if !cleaned.is_empty() && cleaned != "{{path}}" && cleaned != "$path" {
                let candidate = cleaned.split_whitespace().next().unwrap_or(cleaned);
                return Some(candidate.to_string());
            }
        }
    }

    if echo_path.is_some() {
        return echo_path;
    }

    None
}

fn only_cat_var_types(vars_block: &[serde_yaml::Value]) -> bool {
    vars_block.iter().all(|v| {
        let vtype = v.get("type").and_then(|t| t.as_str()).unwrap_or("");
        vtype == "echo" || vtype == "shell"
    })
}

fn get_verbose_form_var(vars_block: &[serde_yaml::Value]) -> Option<&serde_yaml::Value> {
    vars_block.iter().find(|v| {
        let vtype = v.get("type").and_then(|t| t.as_str()).unwrap_or("");
        let has_params = v.get("params").map_or(false, |p| p.is_mapping());
        let has_layout = v
            .get("params")
            .and_then(|p| p.get("layout"))
            .map_or(false, |l| !l.is_null());
        vtype == "form" && has_params && has_layout
    })
}

fn get_supported_form_companion_vars<'a>(
    vars_block: &'a [serde_yaml::Value],
    form_var: &'a serde_yaml::Value,
) -> Vec<&'a serde_yaml::Value> {
    vars_block
        .iter()
        .filter(|v| *v != form_var && v.get("type").and_then(|t| t.as_str()) == Some("date"))
        .collect()
}

pub fn parse_yaml_match(
    match_val: &serde_yaml::Value,
    file_name: &str,
    original_match_index: usize,
    current_display_index: &mut usize,
) -> ParsedYamlFile {
    let mut warnings = Vec::new();
    let mut matches = Vec::new();

    let mut triggers: Vec<String> = Vec::new();
    if let Some(trig_val) = match_val.get("triggers") {
        if let Some(arr) = trig_val.as_sequence() {
            triggers = arr
                .iter()
                .filter_map(|t| match t {
                    serde_yaml::Value::String(s) => Some(s.clone()),
                    serde_yaml::Value::Number(n) => Some(n.to_string()),
                    _ => None,
                })
                .collect();
        } else if let Some(s) = trig_val.as_str() {
            triggers.push(s.to_string());
        }
    } else if let Some(trig_val) = match_val.get("trigger") {
        let trig_str = match trig_val {
            serde_yaml::Value::String(s) => s.clone(),
            serde_yaml::Value::Number(n) => n.to_string(),
            serde_yaml::Value::Bool(b) => b.to_string(),
            _ => "".to_string(),
        };
        if !trig_str.is_empty() {
            triggers.push(trig_str);
        }
    }

    if triggers.is_empty() {
        warnings.push(format!("[{}] Match has no trigger, skipping", file_name));
        return ParsedYamlFile { matches, warnings };
    }

    let description = match_val
        .get("description")
        .and_then(|d| d.as_str())
        .map(|s| s.to_string());

    let empty_vec = Vec::new();
    let vars_block = match_val
        .get("vars")
        .and_then(|v| v.as_sequence())
        .unwrap_or(&empty_vec);

    if !vars_block.is_empty() {
        if only_cat_var_types(vars_block) {
            if let Some(cat_path) = extract_cat_path(vars_block) {
                let parts: Vec<&str> = cat_path.split(&['/', '\\'][..]).collect();
                let original_name = parts.last().unwrap_or(&"");
                let resource_filename = get_resource_filename(original_name);

                let orig_snippet_obj = if triggers.len() > 1 {
                    serde_json::json!({
                        "triggers": triggers,
                        "include_file": resource_filename,
                        "description": description
                    })
                } else {
                    serde_json::json!({
                        "trigger": triggers[0],
                        "include_file": resource_filename,
                        "description": description
                    })
                };
                let orig_snippet_json = serde_json::to_string(&orig_snippet_obj).ok();

                for (trigger_index, trig) in triggers.iter().enumerate() {
                    let display_index = *current_display_index;
                    *current_display_index += 1;

                    let snippet_obj = serde_json::json!({
                        "trigger": trig,
                        "include_file": resource_filename,
                        "description": description
                    });

                    matches.push(ParsedMatchRow {
                        display_index,
                        original_match_index,
                        trigger_index,
                        trigger: trig.clone(),
                        description: description.clone(),
                        content: Some(resource_filename.clone()),
                        kind: "include_file".to_string(),
                        snippet_json: serde_json::to_string(&snippet_obj).unwrap(),
                        original_snippet_json: orig_snippet_json.clone(),
                        resource_path: Some(cat_path.clone()),
                        resource_name: Some(resource_filename.clone()),
                    });
                }

                return ParsedYamlFile { matches, warnings };
            }
        }

        if let Some(form_var) = get_verbose_form_var(vars_block) {
            let companion_vars = get_supported_form_companion_vars(vars_block, form_var);
            let layout_str = form_var
                .get("params")
                .and_then(|p| p.get("layout"))
                .and_then(|l| l.as_str())
                .unwrap_or("")
                .to_string();

            let fields_val = form_var
                .get("params")
                .and_then(|p| p.get("fields"))
                .map(|f| serde_json::to_value(f).unwrap_or(serde_json::Value::Null));

            let companion_val = if !companion_vars.is_empty() {
                Some(serde_json::to_value(&companion_vars).unwrap_or(serde_json::Value::Null))
            } else {
                None
            };

            let orig_snippet_obj = serde_json::json!({
                "triggers": if triggers.len() > 1 { Some(&triggers) } else { None },
                "trigger": if triggers.len() == 1 { Some(&triggers[0]) } else { None },
                "form": layout_str,
                "form_fields": fields_val,
                "vars": companion_val,
                "description": description
            });
            let orig_snippet_json = serde_json::to_string(&orig_snippet_obj).ok();

            for (trigger_index, trig) in triggers.iter().enumerate() {
                let display_index = *current_display_index;
                *current_display_index += 1;

                let snippet_obj = serde_json::json!({
                    "trigger": trig,
                    "form": layout_str,
                    "form_fields": fields_val,
                    "vars": companion_val,
                    "description": description
                });

                matches.push(ParsedMatchRow {
                    display_index,
                    original_match_index,
                    trigger_index,
                    trigger: trig.clone(),
                    description: description.clone(),
                    content: Some(layout_str.clone()),
                    kind: "form".to_string(),
                    snippet_json: serde_json::to_string(&snippet_obj).unwrap(),
                    original_snippet_json: orig_snippet_json.clone(),
                    resource_path: None,
                    resource_name: None,
                });
            }

            return ParsedYamlFile { matches, warnings };
        }
    }

    if let Some(img_val) = match_val.get("image_path") {
        let img_str = img_val.as_str().unwrap_or("").to_string();

        let orig_snippet_obj = serde_json::json!({
            "triggers": if triggers.len() > 1 { Some(&triggers) } else { None },
            "trigger": if triggers.len() == 1 { Some(&triggers[0]) } else { None },
            "image_path": img_str,
            "description": description
        });
        let orig_snippet_json = serde_json::to_string(&orig_snippet_obj).ok();

        for (trigger_index, trig) in triggers.iter().enumerate() {
            let display_index = *current_display_index;
            *current_display_index += 1;

            let snippet_obj = serde_json::json!({
                "trigger": trig,
                "image_path": img_str,
                "description": description
            });

            matches.push(ParsedMatchRow {
                display_index,
                original_match_index,
                trigger_index,
                trigger: trig.clone(),
                description: description.clone(),
                content: Some(img_str.clone()),
                kind: "image_path".to_string(),
                snippet_json: serde_json::to_string(&snippet_obj).unwrap(),
                original_snippet_json: orig_snippet_json.clone(),
                resource_path: None,
                resource_name: None,
            });
        }

        return ParsedYamlFile { matches, warnings };
    }

    if let Some(form_val) = match_val.get("form") {
        let form_str = form_val.as_str().unwrap_or("").to_string();
        let shared_fields = match_val
            .get("form_fields")
            .map(|f| serde_json::to_value(f).unwrap_or(serde_json::Value::Null));

        let orig_snippet_obj = serde_json::json!({
            "triggers": if triggers.len() > 1 { Some(&triggers) } else { None },
            "trigger": if triggers.len() == 1 { Some(&triggers[0]) } else { None },
            "form": form_str,
            "form_fields": shared_fields,
            "description": description
        });
        let orig_snippet_json = serde_json::to_string(&orig_snippet_obj).ok();

        for (trigger_index, trig) in triggers.iter().enumerate() {
            let display_index = *current_display_index;
            *current_display_index += 1;

            let snippet_obj = serde_json::json!({
                "trigger": trig,
                "form": form_str,
                "form_fields": shared_fields,
                "description": description
            });

            matches.push(ParsedMatchRow {
                display_index,
                original_match_index,
                trigger_index,
                trigger: trig.clone(),
                description: description.clone(),
                content: Some(form_str.clone()),
                kind: "form".to_string(),
                snippet_json: serde_json::to_string(&snippet_obj).unwrap(),
                original_snippet_json: orig_snippet_json.clone(),
                resource_path: None,
                resource_name: None,
            });
        }

        return ParsedYamlFile { matches, warnings };
    }

    if let Some(replace_val) = match_val.get("replace") {
        let replace_str = match replace_val {
            serde_yaml::Value::String(s) => s.clone(),
            serde_yaml::Value::Number(n) => n.to_string(),
            serde_yaml::Value::Bool(b) => b.to_string(),
            _ => "".to_string(),
        };

        let vars_json = if !vars_block.is_empty() {
            Some(serde_json::to_value(vars_block).unwrap_or(serde_json::Value::Null))
        } else {
            None
        };

        let orig_snippet_obj = serde_json::json!({
            "triggers": if triggers.len() > 1 { Some(&triggers) } else { None },
            "trigger": if triggers.len() == 1 { Some(&triggers[0]) } else { None },
            "replace": replace_str,
            "vars": vars_json,
            "description": description
        });
        let orig_snippet_json = serde_json::to_string(&orig_snippet_obj).ok();

        for (trigger_index, trig) in triggers.iter().enumerate() {
            let display_index = *current_display_index;
            *current_display_index += 1;

            let snippet_obj = serde_json::json!({
                "trigger": trig,
                "replace": replace_str,
                "vars": vars_json,
                "description": description
            });

            matches.push(ParsedMatchRow {
                display_index,
                original_match_index,
                trigger_index,
                trigger: trig.clone(),
                description: description.clone(),
                content: Some(replace_str.clone()),
                kind: "replace".to_string(),
                snippet_json: serde_json::to_string(&snippet_obj).unwrap(),
                original_snippet_json: orig_snippet_json.clone(),
                resource_path: None,
                resource_name: None,
            });
        }

        return ParsedYamlFile { matches, warnings };
    }

    warnings.push(format!(
        "[{}] Snippet for {} has no replace/form/image/include block, skipping",
        file_name,
        triggers.join(", ")
    ));

    ParsedYamlFile { matches, warnings }
}

pub fn parse_yaml_content(content: &str, file_name: &str) -> ParsedYamlFile {
    let mut warnings = Vec::new();
    let mut matches = Vec::new();

    let yaml_docs: Result<serde_yaml::Value, _> = serde_yaml::from_str(content);
    let doc = match yaml_docs {
        Ok(d) => d,
        Err(e) => {
            warnings.push(format!("[{}] YAML parse error: {}", file_name, e));
            return ParsedYamlFile { matches, warnings };
        }
    };

    let matches_arr = match doc.get("matches").and_then(|m| m.as_sequence()) {
        Some(arr) => arr,
        None => return ParsedYamlFile { matches, warnings },
    };

    let mut display_index = 0;
    for (idx, m) in matches_arr.iter().enumerate() {
        let mut parsed = parse_yaml_match(m, file_name, idx, &mut display_index);
        warnings.append(&mut parsed.warnings);
        matches.append(&mut parsed.matches);
    }

    ParsedYamlFile { matches, warnings }
}

pub fn index_single_file(
    conn: &mut Connection,
    file_path: &str,
    relative_path: &str,
    filename: &str,
    mtime_ns: i64,
    file_size: i64,
) -> Result<(usize, usize), String> {
    let content = match fs::read_to_string(file_path) {
        Ok(c) => c,
        Err(e) => return Err(format!("Failed to read file {}: {}", file_path, e)),
    };

    let parsed = parse_yaml_content(&content, filename);
    let now_ms = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    let warnings_json = serde_json::to_string(&parsed.warnings).unwrap_or_else(|_| "[]".into());
    let snippet_count = parsed.matches.len();
    let warning_count = parsed.warnings.len();

    let tx = conn
        .transaction()
        .map_err(|e| format!("DB transaction error: {}", e))?;

    // Clear old FTS & matches entries
    tx.execute(
        "DELETE FROM matches_fts WHERE rowid IN (SELECT id FROM matches WHERE file_path = ?1)",
        params![file_path],
    )
    .map_err(|e| format!("Failed to delete old FTS entries: {}", e))?;

    tx.execute(
        "DELETE FROM matches WHERE file_path = ?1",
        params![file_path],
    )
    .map_err(|e| format!("Failed to delete old matches: {}", e))?;

    // Insert or replace indexed_files
    tx.execute(
        "INSERT INTO indexed_files (file_path, relative_path, mtime_ns, file_size, snippet_count, warning_count, warnings_json, indexed_at_ms)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(file_path) DO UPDATE SET
            relative_path = excluded.relative_path,
            mtime_ns = excluded.mtime_ns,
            file_size = excluded.file_size,
            snippet_count = excluded.snippet_count,
            warning_count = excluded.warning_count,
            warnings_json = excluded.warnings_json,
            indexed_at_ms = excluded.indexed_at_ms",
        params![
            file_path,
            relative_path,
            mtime_ns,
            file_size,
            snippet_count as i64,
            warning_count as i64,
            warnings_json,
            now_ms
        ],
    )
    .map_err(|e| format!("Failed to upsert indexed_files: {}", e))?;

    for m in &parsed.matches {
        tx.execute(
            "INSERT INTO matches (file_path, relative_path, filename, display_index, original_match_index, trigger_index, trigger, description, content, kind, snippet_json, original_snippet_json, resource_path, resource_name)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                file_path,
                relative_path,
                filename,
                m.display_index as i64,
                m.original_match_index as i64,
                m.trigger_index as i64,
                m.trigger,
                m.description,
                m.content,
                m.kind,
                m.snippet_json,
                m.original_snippet_json,
                m.resource_path,
                m.resource_name
            ],
        )
        .map_err(|e| format!("Failed to insert match: {}", e))?;

        let last_id = tx.last_insert_rowid();

        tx.execute(
            "INSERT INTO matches_fts (rowid, trigger, description, content) VALUES (?1, ?2, ?3, ?4)",
            params![last_id, m.trigger, m.description, m.content],
        )
        .map_err(|e| format!("Failed to insert FTS match: {}", e))?;
    }

    tx.commit()
        .map_err(|e| format!("Failed to commit index transaction: {}", e))?;

    Ok((snippet_count, warning_count))
}

pub fn remove_deleted_file(conn: &mut Connection, file_path: &str) -> Result<(), String> {
    let tx = conn
        .transaction()
        .map_err(|e| format!("DB transaction error: {}", e))?;

    tx.execute(
        "DELETE FROM matches_fts WHERE rowid IN (SELECT id FROM matches WHERE file_path = ?1)",
        params![file_path],
    )
    .map_err(|e| format!("Failed to delete FTS for deleted file: {}", e))?;

    tx.execute(
        "DELETE FROM matches WHERE file_path = ?1",
        params![file_path],
    )
    .map_err(|e| format!("Failed to delete matches for deleted file: {}", e))?;

    tx.execute(
        "DELETE FROM indexed_files WHERE file_path = ?1",
        params![file_path],
    )
    .map_err(|e| format!("Failed to delete indexed_files for deleted file: {}", e))?;

    tx.commit()
        .map_err(|e| format!("Failed to commit delete transaction: {}", e))?;

    Ok(())
}

pub fn sync_match_dir(db_path: &Path, match_dir: &str) -> Result<SearchIndexStatus, String> {
    let match_path = Path::new(match_dir);
    if !match_path.exists() || !match_path.is_dir() {
        return Err(format!("Match directory does not exist: {}", match_dir));
    }

    let mut conn = open_and_init_db(db_path).map_err(|e| e.to_string())?;

    // Load existing indexed_files into map: file_path -> (mtime_ns, file_size)
    let mut db_files: std::collections::HashMap<String, (i64, i64)> =
        std::collections::HashMap::new();
    {
        let mut stmt = conn
            .prepare("SELECT file_path, mtime_ns, file_size FROM indexed_files")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        for r in rows {
            if let Ok((fp, mtime, size)) = r {
                db_files.insert(fp, (mtime, size));
            }
        }
    }

    let mut scanned_files: HashSet<String> = HashSet::new();

    let walker = WalkDir::new(match_path).into_iter();
    for entry in walker.filter_entry(|e| {
        let name = e.file_name().to_string_lossy();
        if name.starts_with('.') || name == "packages" {
            false
        } else {
            true
        }
    }) {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let ext = path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();
        if ext != "yml" && ext != "yaml" {
            continue;
        }

        let file_path_str = path.to_string_lossy().to_string();
        scanned_files.insert(file_path_str.clone());

        let metadata = match fs::metadata(path) {
            Ok(m) => m,
            Err(_) => continue,
        };

        let file_size = metadata.len() as i64;
        let mtime_ns = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
            .map(|d| d.as_nanos() as i64)
            .unwrap_or(0);

        let relative_path = path
            .strip_prefix(match_path)
            .unwrap_or(path)
            .to_string_lossy()
            .to_string();

        let filename = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        if let Some(&(existing_mtime, existing_size)) = db_files.get(&file_path_str) {
            if existing_mtime == mtime_ns && existing_size == file_size {
                // File unchanged, skip parsing
                continue;
            }
        }

        // File modified or new -> index single file
        let _ = index_single_file(
            &mut conn,
            &file_path_str,
            &relative_path,
            &filename,
            mtime_ns,
            file_size,
        );
    }

    // Remove deleted files from DB
    for db_file in db_files.keys() {
        if !scanned_files.contains(db_file) {
            let _ = remove_deleted_file(&mut conn, db_file);
        }
    }

    // Return status
    get_status_from_conn(&conn)
}

pub fn get_status_from_conn(conn: &Connection) -> Result<SearchIndexStatus, String> {
    let indexed_files: usize = conn
        .query_row("SELECT COUNT(*) FROM indexed_files", [], |r| r.get(0))
        .unwrap_or(0);

    let indexed_matches: usize = conn
        .query_row("SELECT COUNT(*) FROM matches", [], |r| r.get(0))
        .unwrap_or(0);

    Ok(SearchIndexStatus {
        state: "ready".to_string(),
        indexed_files,
        total_files: indexed_files,
        indexed_matches,
        last_error: None,
    })
}

fn escape_fts5_query(query: &str) -> String {
    let cleaned: String = query
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '_' || *c == ' ')
        .collect();
    let words: Vec<&str> = cleaned.split_whitespace().collect();
    if words.is_empty() {
        return "".to_string();
    }
    words
        .iter()
        .map(|w| format!("\"{}\"*", w))
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn query_snippet_index(
    db_path: &Path,
    req: &SearchIndexRequest,
) -> Result<SearchIndexResponse, String> {
    let trimmed = req.query.trim();
    let conn = open_and_init_db(db_path).map_err(|e| e.to_string())?;

    let index_status = get_status_from_conn(&conn)?;

    if trimmed.is_empty() || (!req.scope.trigger && !req.scope.description && !req.scope.content) {
        return Ok(SearchIndexResponse {
            results: Vec::new(),
            total: 0,
            index_status,
        });
    }

    let fts_query = escape_fts5_query(trimmed);
    let lower_query = trimmed.to_lowercase();

    // Query strategy: FTS5 match query first, fallback to LIKE query if symbol-heavy or no FTS results
    let mut rows_data = Vec::new();

    if !fts_query.is_empty() {
        // Build scope columns filter for FTS5
        let mut scope_cols = Vec::new();
        if req.scope.trigger {
            scope_cols.push("trigger");
        }
        if req.scope.description {
            scope_cols.push("description");
        }
        if req.scope.content {
            scope_cols.push("content");
        }

        let column_spec = if scope_cols.len() < 3 {
            format!("{{{}}} : ", scope_cols.join(" "))
        } else {
            "".to_string()
        };

        let full_fts_match = format!("{}{}", column_spec, fts_query);

        let sql = "
            SELECT m.file_path, m.relative_path, m.filename, m.snippet_json, m.display_index, m.original_match_index, m.trigger_index, m.trigger, m.description, m.content
            FROM matches m
            JOIN matches_fts fts ON m.id = fts.rowid
            WHERE matches_fts MATCH ?1
            ORDER BY m.id ASC
            LIMIT ?2 OFFSET ?3
        ";

        let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
        let match_rows = stmt
            .query_map(
                params![full_fts_match, req.limit as i64, req.offset as i64],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, i64>(4)? as usize,
                        row.get::<_, i64>(5)? as usize,
                        row.get::<_, i64>(6)? as usize,
                        row.get::<_, String>(7)?,
                        row.get::<_, Option<String>>(8)?,
                        row.get::<_, Option<String>>(9)?,
                    ))
                },
            )
            .map_err(|e| e.to_string())?;

        for r in match_rows {
            if let Ok(data) = r {
                rows_data.push(data);
            }
        }
    }

    // Fallback using LIKE if FTS gave no results or query contains non-alphanumeric (symbols like ':email')
    if rows_data.is_empty() {
        let like_param = format!("%{}%", trimmed);
        let mut where_clauses = Vec::new();
        if req.scope.trigger {
            where_clauses.push("trigger LIKE ?1");
        }
        if req.scope.description {
            where_clauses.push("description LIKE ?1");
        }
        if req.scope.content {
            where_clauses.push("content LIKE ?1");
        }

        if !where_clauses.is_empty() {
            let sql = format!(
                "SELECT file_path, relative_path, filename, snippet_json, display_index, original_match_index, trigger_index, trigger, description, content
                 FROM matches
                 WHERE ({})
                 ORDER BY id ASC
                 LIMIT ?2 OFFSET ?3",
                where_clauses.join(" OR ")
            );

            let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
            let match_rows = stmt
                .query_map(
                    params![like_param, req.limit as i64, req.offset as i64],
                    |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, String>(1)?,
                            row.get::<_, String>(2)?,
                            row.get::<_, String>(3)?,
                            row.get::<_, i64>(4)? as usize,
                            row.get::<_, i64>(5)? as usize,
                            row.get::<_, i64>(6)? as usize,
                            row.get::<_, String>(7)?,
                            row.get::<_, Option<String>>(8)?,
                            row.get::<_, Option<String>>(9)?,
                        ))
                    },
                )
                .map_err(|e| e.to_string())?;

            for r in match_rows {
                if let Ok(data) = r {
                    rows_data.push(data);
                }
            }
        }
    }

    let mut results = Vec::new();

    for (
        file_path,
        relative_path,
        filename,
        snippet_json,
        snippet_index,
        original_match_index,
        trigger_index,
        trigger,
        description,
        content,
    ) in rows_data
    {
        let snippet_val: serde_json::Value =
            serde_json::from_str(&snippet_json).unwrap_or(serde_json::Value::Null);

        let mut matched_fields = Vec::new();
        if req.scope.trigger && trigger.to_lowercase().contains(&lower_query) {
            matched_fields.push("trigger".to_string());
        }
        if req.scope.description {
            if let Some(ref d) = description {
                if d.to_lowercase().contains(&lower_query) {
                    matched_fields.push("description".to_string());
                }
            }
        }
        if req.scope.content {
            if let Some(ref c) = content {
                if c.to_lowercase().contains(&lower_query) {
                    matched_fields.push("content".to_string());
                }
            }
        }

        if !matched_fields.is_empty() {
            results.push(SearchIndexResult {
                file_path,
                file_relative_path: relative_path,
                filename,
                snippet: snippet_val,
                snippet_index,
                original_match_index,
                trigger_index,
                matched_fields,
            });
        }
    }

    let total = results.len();

    Ok(SearchIndexResponse {
        results,
        total,
        index_status,
    })
}

// Tauri commands
#[tauri::command]
pub fn start_search_index_sync(
    app_handle: tauri::AppHandle,
    match_dir: String,
) -> Result<SearchIndexStatus, String> {
    let db_path = resolve_db_path(&app_handle)?;
    sync_match_dir(&db_path, &match_dir)
}

#[tauri::command]
pub fn get_search_index_status(
    app_handle: tauri::AppHandle,
    _match_dir: String,
) -> Result<SearchIndexStatus, String> {
    let db_path = resolve_db_path(&app_handle)?;
    let conn = open_and_init_db(&db_path).map_err(|e| e.to_string())?;
    get_status_from_conn(&conn)
}

#[tauri::command]
pub fn search_snippet_index(
    app_handle: tauri::AppHandle,
    request: SearchIndexRequest,
) -> Result<SearchIndexResponse, String> {
    let db_path = resolve_db_path(&app_handle)?;
    query_snippet_index(&db_path, &request)
}

#[tauri::command]
pub fn refresh_search_index_file(
    app_handle: tauri::AppHandle,
    file_path: String,
    match_dir: String,
) -> Result<SearchIndexStatus, String> {
    let db_path = resolve_db_path(&app_handle)?;
    let path = Path::new(&file_path);
    let match_path = Path::new(&match_dir);

    let mut conn = open_and_init_db(&db_path).map_err(|e| e.to_string())?;

    if !path.exists() {
        let _ = remove_deleted_file(&mut conn, &file_path);
    } else {
        let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
        let file_size = metadata.len() as i64;
        let mtime_ns = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
            .map(|d| d.as_nanos() as i64)
            .unwrap_or(0);

        let relative_path = path
            .strip_prefix(match_path)
            .unwrap_or(path)
            .to_string_lossy()
            .to_string();

        let filename = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let _ = index_single_file(
            &mut conn,
            &file_path,
            &relative_path,
            &filename,
            mtime_ns,
            file_size,
        );
    }

    get_status_from_conn(&conn)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_yaml_parser_parity() {
        let yaml = "
matches:
  - trigger: ':test'
    replace: 'hello world'
    description: 'test snippet'
  - triggers:
      - ':m1'
      - ':m2'
    replace: 'multi trigger'
";
        let parsed = parse_yaml_content(yaml, "test.yml");
        assert_eq!(parsed.matches.len(), 3);
        assert_eq!(parsed.matches[0].trigger, ":test");
        assert_eq!(parsed.matches[0].content.as_deref(), Some("hello world"));
        assert_eq!(parsed.matches[1].trigger, ":m1");
        assert_eq!(parsed.matches[2].trigger, ":m2");
    }

    #[test]
    fn test_indexing_and_search() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.sqlite");

        let match_dir = dir.path().join("match");
        fs::create_dir_all(&match_dir).unwrap();

        let sample_file = match_dir.join("base.yml");
        fs::write(
            &sample_file,
            "matches:\n  - trigger: ':email'\n    replace: 'test@example.com'\n",
        )
        .unwrap();

        let status = sync_match_dir(&db_path, match_dir.to_str().unwrap()).unwrap();
        assert_eq!(status.indexed_files, 1);
        assert_eq!(status.indexed_matches, 1);

        let req = SearchIndexRequest {
            match_dir: match_dir.to_str().unwrap().to_string(),
            query: ":email".to_string(),
            scope: SearchScope {
                trigger: true,
                description: false,
                content: false,
            },
            limit: 10,
            offset: 0,
        };

        let res = query_snippet_index(&db_path, &req).unwrap();
        assert_eq!(res.results.len(), 1);
        assert_eq!(res.results[0].snippet_index, 0);
        assert_eq!(res.results[0].matched_fields, vec!["trigger"]);
    }
}
