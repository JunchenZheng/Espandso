use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use rusqlite::{params, Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{mpsc, Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant, SystemTime};
use tauri::Emitter;
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TriggerConflictSource {
    pub trigger: String,
    pub config_path: String,
    pub relative_path: String,
    pub snippet_index: usize,
    pub trigger_index: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TriggerPrefixConflict {
    pub blocking: TriggerConflictSource,
    pub blocked: TriggerConflictSource,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TriggerConflictsRequest {
    pub match_dir: String,
    pub local_triggers: Vec<TriggerConflictSource>,
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TriggerConflictsResponse {
    pub conflicts: Vec<TriggerPrefixConflict>,
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

struct SearchIndexWatcherState {
    match_dir: String,
    ignored_paths: Arc<Mutex<HashMap<String, Instant>>>,
    _watcher: RecommendedWatcher,
}

static SEARCH_INDEX_WATCHER: OnceLock<Mutex<Option<SearchIndexWatcherState>>> = OnceLock::new();
const WATCHER_DEBOUNCE_MS: u64 = 800;
const INTERNAL_WRITE_IGNORE_MS: u64 = 3_000;

fn watcher_state() -> &'static Mutex<Option<SearchIndexWatcherState>> {
    SEARCH_INDEX_WATCHER.get_or_init(|| Mutex::new(None))
}

fn path_key(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn is_yaml_path(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|s| s.to_str())
            .map(|s| s.to_lowercase()),
        Some(ext) if ext == "yml" || ext == "yaml"
    )
}

fn mark_internal_write_path(file_path: &str) {
    let state_guard = match watcher_state().lock() {
        Ok(guard) => guard,
        Err(_) => return,
    };
    let Some(state) = state_guard.as_ref() else {
        return;
    };
    let Ok(mut ignored_paths) = state.ignored_paths.lock() else {
        return;
    };
    ignored_paths.insert(
        file_path.to_string(),
        Instant::now() + Duration::from_millis(INTERNAL_WRITE_IGNORE_MS),
    );
}

fn remove_expired_ignored_paths(ignored_paths: &mut HashMap<String, Instant>, now: Instant) {
    ignored_paths.retain(|_, expires_at| *expires_at > now);
}

fn should_ignore_event_paths(
    paths: &[PathBuf],
    ignored_paths: &Arc<Mutex<HashMap<String, Instant>>>,
) -> bool {
    let yaml_paths: Vec<String> = paths
        .iter()
        .filter(|path| is_yaml_path(path))
        .map(|path| path_key(path))
        .collect();

    if yaml_paths.is_empty() {
        return false;
    }

    let Ok(mut ignored) = ignored_paths.lock() else {
        return false;
    };
    let now = Instant::now();
    remove_expired_ignored_paths(&mut ignored, now);
    yaml_paths.iter().all(|path| ignored.contains_key(path))
}

fn is_relevant_watch_event(event: &Event) -> bool {
    if event.paths.iter().any(|path| is_yaml_path(path)) {
        return true;
    }

    matches!(event.kind, EventKind::Remove(_) | EventKind::Modify(_))
}

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

fn normalize_match_dir(match_dir: &str) -> String {
    match_dir.trim().trim_end_matches(['/', '\\']).to_string()
}

fn escape_like_pattern(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

fn match_dir_like_pattern(match_dir: &str) -> String {
    let normalized = normalize_match_dir(match_dir);
    if normalized.is_empty() {
        "%".to_string()
    } else {
        format!("{}/%", escape_like_pattern(&normalized))
    }
}

fn match_dir_exact(match_dir: &str) -> String {
    normalize_match_dir(match_dir)
}

fn write_index_state(
    conn: &Connection,
    state: &str,
    match_dir: Option<&str>,
    total_files: Option<usize>,
    last_error: Option<&str>,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO index_meta (key, value) VALUES ('state', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![state],
    )
    .map_err(|e| format!("Failed to update index state: {}", e))?;

    if let Some(dir) = match_dir {
        conn.execute(
            "INSERT INTO index_meta (key, value) VALUES ('match_dir', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![normalize_match_dir(dir)],
        )
        .map_err(|e| format!("Failed to update index match directory: {}", e))?;
    }

    if let Some(total) = total_files {
        conn.execute(
            "INSERT INTO index_meta (key, value) VALUES ('total_files', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![total.to_string()],
        )
        .map_err(|e| format!("Failed to update index total files: {}", e))?;
    }

    if let Some(err) = last_error {
        conn.execute(
            "INSERT INTO index_meta (key, value) VALUES ('last_error', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![err],
        )
        .map_err(|e| format!("Failed to update index error: {}", e))?;
    } else {
        conn.execute("DELETE FROM index_meta WHERE key = 'last_error'", [])
            .map_err(|e| format!("Failed to clear index error: {}", e))?;
    }

    Ok(())
}

fn read_meta_value(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM index_meta WHERE key = ?1",
        params![key],
        |r| r.get(0),
    )
    .ok()
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
        let has_params = v.get("params").is_some_and(|p| p.is_mapping());
        let has_layout = v
            .get("params")
            .and_then(|p| p.get("layout"))
            .is_some_and(|l| !l.is_null());
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
    write_index_state(&conn, "indexing", Some(match_dir), None, None)?;

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
        for (fp, mtime, size) in rows.flatten() {
            db_files.insert(fp, (mtime, size));
        }
    }

    let mut scanned_files: HashSet<String> = HashSet::new();
    let mut total_files = 0usize;
    let mut first_error: Option<String> = None;

    let walker = WalkDir::new(match_path).into_iter();
    for entry in walker.filter_entry(|e| {
        let name = e.file_name().to_string_lossy();
        !(name.starts_with('.') || name == "packages")
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
        total_files += 1;

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
        if let Err(e) = index_single_file(
            &mut conn,
            &file_path_str,
            &relative_path,
            &filename,
            mtime_ns,
            file_size,
        ) {
            if first_error.is_none() {
                first_error = Some(e);
            }
        }
    }

    // Remove deleted files from DB
    for db_file in db_files.keys() {
        if !scanned_files.contains(db_file) {
            if let Err(e) = remove_deleted_file(&mut conn, db_file) {
                if first_error.is_none() {
                    first_error = Some(e);
                }
            }
        }
    }

    let state = if first_error.is_some() {
        "error"
    } else {
        "ready"
    };
    write_index_state(
        &conn,
        state,
        Some(match_dir),
        Some(total_files),
        first_error.as_deref(),
    )?;
    get_status_from_conn(&conn, Some(match_dir))
}

pub fn get_status_from_conn(
    conn: &Connection,
    match_dir: Option<&str>,
) -> Result<SearchIndexStatus, String> {
    let state = read_meta_value(conn, "state").unwrap_or_else(|| "idle".to_string());
    let last_error = read_meta_value(conn, "last_error");
    let state_match_dir = read_meta_value(conn, "match_dir");
    let requested_match_dir = match_dir.map(normalize_match_dir);
    let state_applies_to_match_dir = match (&requested_match_dir, &state_match_dir) {
        (Some(requested), Some(stored)) => requested == stored,
        (Some(_), None) => false,
        _ => true,
    };
    let total_files_meta = if state_applies_to_match_dir {
        read_meta_value(conn, "total_files").and_then(|v| v.parse().ok())
    } else {
        None
    };

    let (indexed_files, indexed_matches): (usize, usize) = if let Some(dir) = match_dir {
        let exact = match_dir_exact(dir);
        let like = match_dir_like_pattern(dir);
        let files = conn
            .query_row(
                "SELECT COUNT(*) FROM indexed_files
                 WHERE file_path = ?1 OR file_path LIKE ?2 ESCAPE '\\'",
                params![exact, like],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let matches = conn
            .query_row(
                "SELECT COUNT(*) FROM matches
                 WHERE file_path = ?1 OR file_path LIKE ?2 ESCAPE '\\'",
                params![match_dir_exact(dir), match_dir_like_pattern(dir)],
                |r| r.get(0),
            )
            .unwrap_or(0);
        (files, matches)
    } else {
        let files = conn
            .query_row("SELECT COUNT(*) FROM indexed_files", [], |r| r.get(0))
            .unwrap_or(0);
        let matches = conn
            .query_row("SELECT COUNT(*) FROM matches", [], |r| r.get(0))
            .unwrap_or(0);
        (files, matches)
    };

    Ok(SearchIndexStatus {
        state: if state_applies_to_match_dir {
            state
        } else {
            "idle".to_string()
        },
        indexed_files,
        total_files: total_files_meta
            .map(|total: usize| total.max(indexed_files))
            .unwrap_or(indexed_files),
        indexed_matches,
        last_error: if state_applies_to_match_dir {
            last_error
        } else {
            None
        },
    })
}

pub fn query_snippet_index(
    db_path: &Path,
    req: &SearchIndexRequest,
) -> Result<SearchIndexResponse, String> {
    let trimmed = req.query.trim();
    let conn = open_and_init_db(db_path).map_err(|e| e.to_string())?;

    let index_status = get_status_from_conn(&conn, Some(&req.match_dir))?;

    if trimmed.is_empty() || (!req.scope.trigger && !req.scope.description && !req.scope.content) {
        return Ok(SearchIndexResponse {
            results: Vec::new(),
            total: 0,
            index_status,
        });
    }

    let lower_query = trimmed.to_lowercase();
    let path_exact = match_dir_exact(&req.match_dir);
    let path_like = match_dir_like_pattern(&req.match_dir);
    let like_param = format!("%{}%", escape_like_pattern(trimmed));
    let trigger_scope = if req.scope.trigger { 1 } else { 0 };
    let description_scope = if req.scope.description { 1 } else { 0 };
    let content_scope = if req.scope.content { 1 } else { 0 };

    let total: usize = conn
        .query_row(
            "
            SELECT COUNT(*)
            FROM matches m
            WHERE (m.file_path = ?1 OR m.file_path LIKE ?2 ESCAPE '\\')
              AND (
                (?3 = 1 AND m.trigger LIKE ?4 ESCAPE '\\')
                OR (?5 = 1 AND m.description LIKE ?4 ESCAPE '\\')
                OR (?6 = 1 AND m.content LIKE ?4 ESCAPE '\\')
              )
            ",
            params![
                path_exact,
                path_like,
                trigger_scope,
                like_param,
                description_scope,
                content_scope
            ],
            |r| r.get(0),
        )
        .map_err(|e| format!("Failed to count search results: {}", e))?;

    let mut rows_data = Vec::new();
    let sql = "
        SELECT m.file_path, m.relative_path, m.filename, m.snippet_json, m.display_index, m.original_match_index, m.trigger_index, m.trigger, m.description, m.content
        FROM matches m
        WHERE (m.file_path = ?1 OR m.file_path LIKE ?2 ESCAPE '\\')
          AND (
            (?3 = 1 AND m.trigger LIKE ?4 ESCAPE '\\')
            OR (?5 = 1 AND m.description LIKE ?4 ESCAPE '\\')
            OR (?6 = 1 AND m.content LIKE ?4 ESCAPE '\\')
          )
        ORDER BY m.id ASC
        LIMIT ?7 OFFSET ?8
    ";

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let match_rows = stmt
        .query_map(
            params![
                match_dir_exact(&req.match_dir),
                match_dir_like_pattern(&req.match_dir),
                trigger_scope,
                format!("%{}%", escape_like_pattern(trimmed)),
                description_scope,
                content_scope,
                req.limit as i64,
                req.offset as i64
            ],
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

    for data in match_rows.flatten() {
        rows_data.push(data);
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

    Ok(SearchIndexResponse {
        results,
        total,
        index_status,
    })
}

pub fn query_trigger_prefix_conflicts(
    db_path: &Path,
    req: &TriggerConflictsRequest,
) -> Result<TriggerConflictsResponse, String> {
    let mut conn = open_and_init_db(db_path).map_err(|e| e.to_string())?;
    let index_status = get_status_from_conn(&conn, Some(&req.match_dir))?;

    conn.execute_batch(
        "
        CREATE TEMP TABLE IF NOT EXISTS local_trigger_conflict_sources (
            trigger TEXT PRIMARY KEY,
            file_path TEXT NOT NULL,
            relative_path TEXT NOT NULL,
            snippet_index INTEGER NOT NULL,
            trigger_index INTEGER NOT NULL
        );
        DELETE FROM local_trigger_conflict_sources;
        ",
    )
    .map_err(|e| format!("Failed to prepare trigger conflict query: {}", e))?;

    {
        let tx = conn
            .transaction()
            .map_err(|e| format!("Failed to start trigger conflict query: {}", e))?;
        let mut seen_triggers = HashSet::new();

        for source in &req.local_triggers {
            let trigger = source.trigger.trim();
            if trigger.is_empty() || !seen_triggers.insert(trigger.to_string()) {
                continue;
            }

            tx.execute(
                "INSERT INTO local_trigger_conflict_sources (trigger, file_path, relative_path, snippet_index, trigger_index)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    trigger,
                    source.config_path,
                    source.relative_path,
                    source.snippet_index as i64,
                    source.trigger_index as i64,
                ],
            )
            .map_err(|e| format!("Failed to stage trigger conflict source: {}", e))?;
        }

        tx.commit()
            .map_err(|e| format!("Failed to stage trigger conflict sources: {}", e))?;
    }

    let path_exact = match_dir_exact(&req.match_dir);
    let path_like = match_dir_like_pattern(&req.match_dir);
    let mut stmt = conn
        .prepare(
            "
            SELECT
                l.trigger AS blocking_trigger,
                l.file_path AS blocking_file_path,
                l.relative_path AS blocking_relative_path,
                l.snippet_index AS blocking_snippet_index,
                l.trigger_index AS blocking_trigger_index,
                m.trigger AS blocked_trigger,
                m.file_path AS blocked_file_path,
                m.relative_path AS blocked_relative_path,
                m.display_index AS blocked_snippet_index,
                m.trigger_index AS blocked_trigger_index
            FROM local_trigger_conflict_sources l
            JOIN matches m
              ON m.trigger <> l.trigger
             AND length(m.trigger) > length(l.trigger)
             AND substr(m.trigger, 1, length(l.trigger)) = l.trigger
            WHERE (m.file_path = ?1 OR m.file_path LIKE ?2 ESCAPE '\\')

            UNION ALL

            SELECT
                m.trigger AS blocking_trigger,
                m.file_path AS blocking_file_path,
                m.relative_path AS blocking_relative_path,
                m.display_index AS blocking_snippet_index,
                m.trigger_index AS blocking_trigger_index,
                l.trigger AS blocked_trigger,
                l.file_path AS blocked_file_path,
                l.relative_path AS blocked_relative_path,
                l.snippet_index AS blocked_snippet_index,
                l.trigger_index AS blocked_trigger_index
            FROM local_trigger_conflict_sources l
            JOIN matches m
              ON m.trigger <> l.trigger
             AND length(l.trigger) > length(m.trigger)
             AND substr(l.trigger, 1, length(m.trigger)) = m.trigger
            WHERE (m.file_path = ?1 OR m.file_path LIKE ?2 ESCAPE '\\')
            ORDER BY blocking_trigger, blocked_trigger, blocking_relative_path, blocked_relative_path
            ",
        )
        .map_err(|e| format!("Failed to prepare trigger conflict SQL: {}", e))?;

    let rows = stmt
        .query_map(params![path_exact, path_like], |row| {
            let blocking = TriggerConflictSource {
                trigger: row.get(0)?,
                config_path: row.get(1)?,
                relative_path: row.get(2)?,
                snippet_index: row.get::<_, i64>(3)? as usize,
                trigger_index: row.get::<_, i64>(4)? as usize,
            };
            let blocked = TriggerConflictSource {
                trigger: row.get(5)?,
                config_path: row.get(6)?,
                relative_path: row.get(7)?,
                snippet_index: row.get::<_, i64>(8)? as usize,
                trigger_index: row.get::<_, i64>(9)? as usize,
            };

            Ok(TriggerPrefixConflict { blocking, blocked })
        })
        .map_err(|e| format!("Failed to query trigger conflicts: {}", e))?;

    let limit = req.limit.unwrap_or(1_000);
    let mut conflicts = Vec::new();
    let mut seen_pairs = HashSet::new();

    for row in rows {
        let conflict = row.map_err(|e| format!("Failed to read trigger conflict: {}", e))?;
        let pair_key = format!(
            "{}\u{0}{}\u{0}{}\u{0}{}\u{0}{}\u{0}{}",
            conflict.blocking.trigger,
            conflict.blocking.config_path,
            conflict.blocking.snippet_index,
            conflict.blocked.trigger,
            conflict.blocked.config_path,
            conflict.blocked.snippet_index,
        );
        if !seen_pairs.insert(pair_key) {
            continue;
        }
        conflicts.push(conflict);
        if conflicts.len() >= limit {
            break;
        }
    }

    Ok(TriggerConflictsResponse {
        conflicts,
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
    match_dir: String,
) -> Result<SearchIndexStatus, String> {
    let db_path = resolve_db_path(&app_handle)?;
    let conn = open_and_init_db(&db_path).map_err(|e| e.to_string())?;
    get_status_from_conn(&conn, Some(&match_dir))
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
pub fn detect_trigger_prefix_conflicts(
    app_handle: tauri::AppHandle,
    request: TriggerConflictsRequest,
) -> Result<TriggerConflictsResponse, String> {
    let db_path = resolve_db_path(&app_handle)?;
    query_trigger_prefix_conflicts(&db_path, &request)
}

#[tauri::command]
pub fn refresh_search_index_file(
    app_handle: tauri::AppHandle,
    file_path: String,
    match_dir: String,
) -> Result<SearchIndexStatus, String> {
    mark_internal_write_path(&file_path);
    let db_path = resolve_db_path(&app_handle)?;
    let path = Path::new(&file_path);
    let match_path = Path::new(&match_dir);

    let mut conn = open_and_init_db(&db_path).map_err(|e| e.to_string())?;

    if !path.exists() {
        if let Err(e) = remove_deleted_file(&mut conn, &file_path) {
            write_index_state(&conn, "error", Some(&match_dir), None, Some(&e))?;
            return get_status_from_conn(&conn, Some(&match_dir));
        }
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

        if let Err(e) = index_single_file(
            &mut conn,
            &file_path,
            &relative_path,
            &filename,
            mtime_ns,
            file_size,
        ) {
            write_index_state(&conn, "error", Some(&match_dir), None, Some(&e))?;
            return get_status_from_conn(&conn, Some(&match_dir));
        }
    }

    write_index_state(&conn, "ready", Some(&match_dir), None, None)?;
    get_status_from_conn(&conn, Some(&match_dir))
}

#[tauri::command]
pub fn mark_search_index_internal_write(file_path: String) -> Result<(), String> {
    mark_internal_write_path(&file_path);
    Ok(())
}

#[tauri::command]
pub fn start_search_index_watcher(
    app_handle: tauri::AppHandle,
    match_dir: String,
) -> Result<(), String> {
    let match_path = PathBuf::from(&match_dir);
    if !match_path.exists() || !match_path.is_dir() {
        return Err(format!("Match directory does not exist: {}", match_dir));
    }

    {
        let mut state = watcher_state()
            .lock()
            .map_err(|_| "Search index watcher state is unavailable.".to_string())?;
        if state
            .as_ref()
            .map(|current| current.match_dir.as_str() == match_dir.as_str())
            .unwrap_or(false)
        {
            return Ok(());
        }
        *state = None;
    }

    let (tx, rx) = mpsc::channel::<notify::Result<Event>>();
    let mut watcher = RecommendedWatcher::new(
        move |res| {
            let _ = tx.send(res);
        },
        Config::default(),
    )
    .map_err(|e| format!("Failed to create search index watcher: {}", e))?;

    watcher
        .watch(&match_path, RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to watch match directory: {}", e))?;

    let ignored_paths = Arc::new(Mutex::new(HashMap::new()));
    let thread_ignored_paths = Arc::clone(&ignored_paths);
    let thread_app_handle = app_handle.clone();
    let thread_match_dir = match_dir.clone();

    thread::spawn(move || {
        let mut pending_paths: Vec<PathBuf> = Vec::new();

        while let Ok(first_event) = rx.recv() {
            if let Ok(event) = first_event {
                if is_relevant_watch_event(&event) {
                    pending_paths.extend(event.paths);
                }
            }

            while let Ok(event_result) = rx.recv_timeout(Duration::from_millis(WATCHER_DEBOUNCE_MS))
            {
                if let Ok(event) = event_result {
                    if is_relevant_watch_event(&event) {
                        pending_paths.extend(event.paths);
                    }
                }
            }

            if pending_paths.is_empty() {
                continue;
            }

            let event_paths = std::mem::take(&mut pending_paths);
            if should_ignore_event_paths(&event_paths, &thread_ignored_paths) {
                continue;
            }

            let status = resolve_db_path(&thread_app_handle)
                .and_then(|db_path| sync_match_dir(&db_path, &thread_match_dir));

            match status {
                Ok(status) => {
                    let _ = thread_app_handle.emit("search-index-status-changed", status);
                }
                Err(e) => {
                    let _ = thread_app_handle.emit("search-index-watch-error", e);
                }
            }
        }
    });

    let mut state = watcher_state()
        .lock()
        .map_err(|_| "Search index watcher state is unavailable.".to_string())?;
    *state = Some(SearchIndexWatcherState {
        match_dir,
        ignored_paths,
        _watcher: watcher,
    });
    Ok(())
}

#[tauri::command]
pub fn stop_search_index_watcher() -> Result<(), String> {
    let mut state = watcher_state()
        .lock()
        .map_err(|_| "Search index watcher state is unavailable.".to_string())?;
    *state = None;
    Ok(())
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

    #[test]
    fn test_sync_removes_deleted_yaml_file_from_index() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.sqlite");

        let match_dir = dir.path().join("match");
        fs::create_dir_all(&match_dir).unwrap();

        let sample_file = match_dir.join("base.yml");
        fs::write(
            &sample_file,
            "matches:\n  - trigger: ':stale'\n    replace: 'deleted data'\n",
        )
        .unwrap();

        let status = sync_match_dir(&db_path, match_dir.to_str().unwrap()).unwrap();
        assert_eq!(status.indexed_files, 1);
        assert_eq!(status.indexed_matches, 1);

        fs::remove_file(&sample_file).unwrap();
        let status = sync_match_dir(&db_path, match_dir.to_str().unwrap()).unwrap();
        assert_eq!(status.indexed_files, 0);
        assert_eq!(status.indexed_matches, 0);

        let req = SearchIndexRequest {
            match_dir: match_dir.to_str().unwrap().to_string(),
            query: ":stale".to_string(),
            scope: SearchScope {
                trigger: true,
                description: true,
                content: true,
            },
            limit: 10,
            offset: 0,
        };

        let res = query_snippet_index(&db_path, &req).unwrap();
        assert_eq!(res.results.len(), 0);
    }

    #[test]
    fn test_yaml_parser_supported_shapes() {
        let yaml = include_str!("../../test_data/yaml/search-index-shapes.yml");
        let parsed = parse_yaml_content(yaml, "shapes.yml");
        assert_eq!(parsed.matches.len(), 7);

        let include_snippet: serde_json::Value =
            serde_json::from_str(&parsed.matches[3].snippet_json).unwrap();
        assert_eq!(include_snippet["include_file"], "customer_data.json");
        assert_eq!(
            parsed.matches[3].resource_name.as_deref(),
            Some("customer_data.json")
        );
        assert_eq!(parsed.matches[4].kind, "image_path");
        assert_eq!(parsed.matches[5].trigger, ":form");
        assert_eq!(parsed.matches[6].kind, "form");
        assert!(parsed.matches[6].snippet_json.contains("form_fields"));
        assert!(parsed.matches[6].snippet_json.contains("vars"));
    }

    #[test]
    fn test_path_helpers_normalize_and_escape_match_dirs() {
        assert_eq!(normalize_match_dir("/tmp/match/"), "/tmp/match");
        assert_eq!(normalize_match_dir(" C:\\match\\ "), "C:\\match");
        assert_eq!(
            match_dir_like_pattern("/tmp/100%_match"),
            "/tmp/100\\%\\_match/%"
        );
        assert_eq!(match_dir_exact("/tmp/match/"), "/tmp/match");
        assert!(is_yaml_path(Path::new("base.yml")));
        assert!(is_yaml_path(Path::new("base.YAML")));
        assert!(!is_yaml_path(Path::new("notes.txt")));
    }

    #[test]
    fn test_search_uses_substring_semantics_with_pagination_total() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.sqlite");
        let match_dir = dir.path().join("match");
        fs::create_dir_all(&match_dir).unwrap();

        fs::write(
            match_dir.join("base.yml"),
            "matches:\n  - trigger: ':email'\n    replace: 'one'\n  - trigger: ':xemail'\n    replace: 'two'\n",
        )
        .unwrap();

        sync_match_dir(&db_path, match_dir.to_str().unwrap()).unwrap();

        let req = SearchIndexRequest {
            match_dir: match_dir.to_str().unwrap().to_string(),
            query: "ema".to_string(),
            scope: SearchScope {
                trigger: true,
                description: false,
                content: false,
            },
            limit: 1,
            offset: 0,
        };

        let first_page = query_snippet_index(&db_path, &req).unwrap();
        assert_eq!(first_page.total, 2);
        assert_eq!(first_page.results.len(), 1);
        assert_eq!(first_page.results[0].snippet_index, 0);

        let second_page =
            query_snippet_index(&db_path, &SearchIndexRequest { offset: 1, ..req }).unwrap();
        assert_eq!(second_page.total, 2);
        assert_eq!(second_page.results.len(), 1);
        assert_eq!(second_page.results[0].snippet_index, 1);
    }

    #[test]
    fn test_search_escapes_like_wildcards() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.sqlite");
        let match_dir = dir.path().join("match");
        fs::create_dir_all(&match_dir).unwrap();

        fs::write(
            match_dir.join("base.yml"),
            "matches:\n  - trigger: ':percent'\n    replace: '100% ready'\n  - trigger: ':plain'\n    replace: 'plain text'\n",
        )
        .unwrap();

        sync_match_dir(&db_path, match_dir.to_str().unwrap()).unwrap();

        let res = query_snippet_index(
            &db_path,
            &SearchIndexRequest {
                match_dir: match_dir.to_str().unwrap().to_string(),
                query: "%".to_string(),
                scope: SearchScope {
                    trigger: false,
                    description: false,
                    content: true,
                },
                limit: 10,
                offset: 0,
            },
        )
        .unwrap();

        assert_eq!(res.total, 1);
        assert_eq!(res.results[0].snippet_index, 0);
    }

    #[test]
    fn test_search_filters_by_match_dir() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.sqlite");
        let match_dir_a = dir.path().join("match-a");
        let match_dir_b = dir.path().join("match-b");
        fs::create_dir_all(&match_dir_a).unwrap();
        fs::create_dir_all(&match_dir_b).unwrap();

        let file_a = match_dir_a.join("base.yml");
        let file_b = match_dir_b.join("base.yml");
        fs::write(
            &file_a,
            "matches:\n  - trigger: ':same'\n    replace: 'from a'\n",
        )
        .unwrap();
        fs::write(
            &file_b,
            "matches:\n  - trigger: ':same'\n    replace: 'from b'\n",
        )
        .unwrap();

        let mut conn = open_and_init_db(&db_path).unwrap();
        index_single_file(
            &mut conn,
            file_a.to_str().unwrap(),
            "base.yml",
            "base.yml",
            1,
            1,
        )
        .unwrap();
        index_single_file(
            &mut conn,
            file_b.to_str().unwrap(),
            "base.yml",
            "base.yml",
            1,
            1,
        )
        .unwrap();

        let res = query_snippet_index(
            &db_path,
            &SearchIndexRequest {
                match_dir: match_dir_b.to_str().unwrap().to_string(),
                query: ":same".to_string(),
                scope: SearchScope {
                    trigger: true,
                    description: false,
                    content: false,
                },
                limit: 10,
                offset: 0,
            },
        )
        .unwrap();

        assert_eq!(res.total, 1);
        assert!(res.results[0].file_path.ends_with("match-b/base.yml"));
    }

    #[test]
    fn test_trigger_prefix_conflicts_query_uses_indexed_matches() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.sqlite");
        let match_dir = dir.path().join("match");
        fs::create_dir_all(&match_dir).unwrap();

        let base_file = match_dir.join("base.yml");
        let work_file = match_dir.join("work.yml");
        fs::write(
            &base_file,
            "matches:\n  - trigger: ':esp'\n    replace: 'short'\n  - trigger: ':same'\n    replace: 'one'\n",
        )
        .unwrap();
        fs::write(
            &work_file,
            "matches:\n  - trigger: ':espanso'\n    replace: 'long'\n  - trigger: ':same'\n    replace: 'two'\n",
        )
        .unwrap();

        let status = sync_match_dir(&db_path, match_dir.to_str().unwrap()).unwrap();
        assert_eq!(status.indexed_files, 2);
        assert_eq!(status.indexed_matches, 4);

        let res = query_trigger_prefix_conflicts(
            &db_path,
            &TriggerConflictsRequest {
                match_dir: match_dir.to_string_lossy().to_string(),
                local_triggers: vec![
                    TriggerConflictSource {
                        trigger: ":esp".to_string(),
                        config_path: base_file.to_string_lossy().to_string(),
                        relative_path: "base.yml".to_string(),
                        snippet_index: 0,
                        trigger_index: 0,
                    },
                    TriggerConflictSource {
                        trigger: ":same".to_string(),
                        config_path: base_file.to_string_lossy().to_string(),
                        relative_path: "base.yml".to_string(),
                        snippet_index: 1,
                        trigger_index: 0,
                    },
                ],
                limit: Some(10),
            },
        )
        .unwrap();

        assert_eq!(res.conflicts.len(), 1);
        assert_eq!(res.conflicts[0].blocking.trigger, ":esp");
        assert_eq!(res.conflicts[0].blocked.trigger, ":espanso");
        assert!(res.conflicts[0].blocked.config_path.ends_with("work.yml"));
    }
}
