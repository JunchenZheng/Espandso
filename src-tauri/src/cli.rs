use serde_yaml::Value;
use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::Command;

const DEFAULT_CONFIG_FILE: &str = "base.yml";

#[derive(Debug, Clone, PartialEq, Eq)]
enum SnippetMode {
    Text,
    File,
    Image,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct AddSnippetOptions {
    mode: SnippetMode,
    trigger: String,
    content: String,
    description: Option<String>,
    config: String,
    match_dir: Option<PathBuf>,
    restart: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct AddSnippetResult {
    target_path: PathBuf,
    restart_warning: Option<String>,
}

pub fn try_run_cli_from_env() -> Result<bool, String> {
    let args: Vec<String> = env::args().skip(1).collect();
    try_run_cli(args)
}

fn try_run_cli(args: Vec<String>) -> Result<bool, String> {
    if args.is_empty() {
        return Ok(false);
    }

    match args[0].as_str() {
        "add" => {
            let options = parse_add_options(&args[1..])?;
            let result = add_snippet(options)?;
            println!("Added snippet to {}", result.target_path.display());
            if let Some(warning) = result.restart_warning {
                eprintln!("Warning: {}", warning);
            }
            Ok(true)
        }
        "-h" | "--help" | "help" => {
            print_usage();
            Ok(true)
        }
        _ => Ok(false),
    }
}

fn print_usage() {
    println!(
        "Usage:
  expandso add --mode text|file|image --trigger <trigger> --content <content> [options]

Options:
  --description <text>  Optional Espanso description.
  --config <file>       Target YAML file or match-dir relative path. Defaults to base.yml.
  --match-dir <dir>     Espanso match directory. Defaults to `espanso path` or platform default.
  --no-restart          Write the snippet without running `espanso restart`.
  -h, --help            Show this help."
    );
}

fn parse_add_options(args: &[String]) -> Result<AddSnippetOptions, String> {
    let mut mode: Option<SnippetMode> = None;
    let mut trigger: Option<String> = None;
    let mut content: Option<String> = None;
    let mut description: Option<String> = None;
    let mut config = DEFAULT_CONFIG_FILE.to_string();
    let mut match_dir: Option<PathBuf> = env::var_os("EXPANDSO_MATCH_DIR").map(PathBuf::from);
    let mut restart = true;

    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--mode" | "-m" => {
                let value = read_flag_value(args, &mut index, "--mode")?;
                mode = Some(parse_mode(&value)?);
            }
            "--trigger" | "-t" => {
                trigger = Some(read_flag_value(args, &mut index, "--trigger")?);
            }
            "--content" | "-c" => {
                content = Some(read_flag_value(args, &mut index, "--content")?);
            }
            "--description" | "-d" => {
                description = Some(read_flag_value(args, &mut index, "--description")?);
            }
            "--config" => {
                config = read_flag_value(args, &mut index, "--config")?;
            }
            "--match-dir" => {
                match_dir = Some(PathBuf::from(read_flag_value(
                    args,
                    &mut index,
                    "--match-dir",
                )?));
            }
            "--no-restart" => {
                restart = false;
            }
            "-h" | "--help" => {
                print_usage();
                return Err("help requested".to_string());
            }
            unknown => return Err(format!("Unknown option: {}", unknown)),
        }
        index += 1;
    }

    let trigger = required_non_empty(trigger, "--trigger")?;
    let content = required_non_empty(content, "--content")?;
    if let Some(desc) = description.as_ref() {
        if desc.trim().is_empty() {
            description = None;
        }
    }

    Ok(AddSnippetOptions {
        mode: mode.ok_or_else(|| "--mode is required".to_string())?,
        trigger,
        content,
        description,
        config,
        match_dir,
        restart,
    })
}

fn read_flag_value(args: &[String], index: &mut usize, flag: &str) -> Result<String, String> {
    *index += 1;
    args.get(*index)
        .cloned()
        .ok_or_else(|| format!("{} requires a value", flag))
}

fn required_non_empty(value: Option<String>, flag: &str) -> Result<String, String> {
    let value = value.ok_or_else(|| format!("{} is required", flag))?;
    if value.trim().is_empty() {
        return Err(format!("{} must not be empty", flag));
    }
    Ok(value)
}

fn parse_mode(value: &str) -> Result<SnippetMode, String> {
    match value.to_ascii_lowercase().as_str() {
        "text" => Ok(SnippetMode::Text),
        "file" => Ok(SnippetMode::File),
        "image" => Ok(SnippetMode::Image),
        _ => Err("--mode must be one of: text, file, image".to_string()),
    }
}

fn add_snippet(options: AddSnippetOptions) -> Result<AddSnippetResult, String> {
    let target_path = resolve_target_path(&options)?;
    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create {}: {}", parent.display(), e))?;
    }

    let existing_content = match fs::read_to_string(&target_path) {
        Ok(content) => content,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(e) => return Err(format!("Failed to read {}: {}", target_path.display(), e)),
    };

    validate_yaml_for_append(&existing_content, &options.trigger)?;
    let item_yaml = snippet_to_yaml_item(&options)?;
    let updated_content = append_match_to_yaml_content(&existing_content, &item_yaml)?;
    fs::write(&target_path, updated_content)
        .map_err(|e| format!("Failed to write {}: {}", target_path.display(), e))?;

    let restart_warning = if options.restart {
        restart_espanso().err()
    } else {
        None
    };

    Ok(AddSnippetResult {
        target_path,
        restart_warning,
    })
}

fn resolve_target_path(options: &AddSnippetOptions) -> Result<PathBuf, String> {
    let config_path = PathBuf::from(&options.config);
    if config_path.is_absolute() {
        return Ok(config_path);
    }

    let match_dir = match options.match_dir.as_ref() {
        Some(path) => path.clone(),
        None => resolve_espanso_match_dir()?,
    };

    Ok(match_dir.join(config_path))
}

fn resolve_espanso_match_dir() -> Result<PathBuf, String> {
    if let Ok(output) = Command::new("espanso").arg("path").output() {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Some(config_dir) = parse_espanso_config_dir(&stdout) {
                return Ok(config_dir.join("match"));
            }
        }
    }

    default_espanso_match_dir()
}

fn parse_espanso_config_dir(output: &str) -> Option<PathBuf> {
    output.lines().find_map(|line| {
        let trimmed = line.trim();
        if trimmed.to_ascii_lowercase().starts_with("config:") {
            let path = trimmed
                .split_once(':')
                .map(|(_, value)| value.trim())
                .unwrap_or_default();
            if !path.is_empty() {
                return Some(PathBuf::from(path));
            }
        }
        None
    })
}

fn default_espanso_match_dir() -> Result<PathBuf, String> {
    let home = env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .ok_or_else(|| "Unable to resolve home directory".to_string())?;

    #[cfg(target_os = "macos")]
    {
        Ok(home.join("Library/Application Support/espanso/match"))
    }

    #[cfg(target_os = "windows")]
    {
        Ok(home.join("AppData/Roaming/espanso/match"))
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        Ok(home.join(".config/espanso/match"))
    }
}

fn validate_yaml_for_append(content: &str, _trigger: &str) -> Result<(), String> {
    if content.trim().is_empty() {
        return Ok(());
    }

    let doc: Value =
        serde_yaml::from_str(content).map_err(|e| format!("YAML parse error: {}", e))?;
    let Some(matches) = doc.get("matches") else {
        return Ok(());
    };
    let Some(_sequence) = matches.as_sequence() else {
        return Err("YAML root 'matches' must be a list before snippets can be added.".to_string());
    };

    Ok(())
}

fn snippet_to_yaml_item(options: &AddSnippetOptions) -> Result<String, String> {
    let mut lines = Vec::new();
    push_yaml_field(&mut lines, "- trigger", &options.trigger, 0)?;

    match options.mode {
        SnippetMode::Text => {
            push_yaml_field(&mut lines, "replace", &options.content, 2)?;
        }
        SnippetMode::File => {
            push_yaml_field(&mut lines, "replace", "{{output}}", 2)?;
            lines.push("  vars:".to_string());
            lines.push("    - name: output".to_string());
            lines.push("      type: shell".to_string());
            lines.push("      params:".to_string());
            push_yaml_field(
                &mut lines,
                "cmd",
                &cat_command_for_file(&options.content),
                8,
            )?;
        }
        SnippetMode::Image => {
            push_yaml_field(&mut lines, "image_path", &options.content, 2)?;
        }
    }

    if let Some(description) = options.description.as_ref() {
        push_yaml_field(&mut lines, "description", description, 2)?;
    }

    Ok(lines.join("\n"))
}

fn push_yaml_field(
    lines: &mut Vec<String>,
    key: &str,
    value: &str,
    indent: usize,
) -> Result<(), String> {
    let prefix = " ".repeat(indent);
    if value.contains('\n') {
        let chomp = if value.ends_with('\n') { "|" } else { "|-" };
        lines.push(format!("{}{}: {}", prefix, key, chomp));
        let child_prefix = " ".repeat(indent + 2);
        let content = if value.ends_with('\n') {
            value.strip_suffix('\n').unwrap_or(value)
        } else {
            value
        };
        for line in content.split('\n') {
            lines.push(format!("{}{}", child_prefix, line));
        }
        return Ok(());
    }

    lines.push(format!("{}{}: {}", prefix, key, yaml_scalar(value)?));
    Ok(())
}

fn yaml_scalar(value: &str) -> Result<String, String> {
    let serialized = serde_yaml::to_string(&Value::String(value.to_string()))
        .map_err(|e| format!("Failed to serialize YAML scalar: {}", e))?;
    Ok(serialized
        .trim_end()
        .strip_prefix("---\n")
        .unwrap_or(serialized.trim_end())
        .to_string())
}

fn cat_command_for_file(path: &str) -> String {
    format!("cat \"{}\"", path.replace('"', "\\\""))
}

fn append_match_to_yaml_content(content: &str, item_yaml: &str) -> Result<String, String> {
    if content.trim().is_empty() {
        return Ok(format!("matches:\n{}\n", indent_yaml_item(item_yaml)));
    }

    if let Some(matches_line) = find_matches_block_line(content) {
        let mut lines: Vec<String> = content.lines().map(ToString::to_string).collect();
        let insert_at = find_end_of_matches_block(&lines, matches_line);
        let indented_item = indent_yaml_item(item_yaml);
        let mut insert_lines: Vec<String> =
            indented_item.lines().map(ToString::to_string).collect();

        if insert_at > 0 && !lines[insert_at - 1].trim().is_empty() {
            insert_lines.insert(0, String::new());
        }
        if insert_at < lines.len() && !lines[insert_at].trim().is_empty() {
            insert_lines.push(String::new());
        }

        lines.splice(insert_at..insert_at, insert_lines);
        return Ok(format!("{}\n", lines.join("\n")));
    }

    append_by_yaml_round_trip(content, item_yaml)
}

fn find_matches_block_line(content: &str) -> Option<usize> {
    content.lines().position(|line| {
        let trimmed = line.trim();
        !line.starts_with(char::is_whitespace)
            && (trimmed == "matches:" || trimmed.starts_with("matches: #"))
    })
}

fn find_end_of_matches_block(lines: &[String], matches_line: usize) -> usize {
    lines
        .iter()
        .enumerate()
        .skip(matches_line + 1)
        .find_map(|(index, line)| {
            if is_top_level_yaml_key(line) {
                Some(index)
            } else {
                None
            }
        })
        .unwrap_or(lines.len())
}

fn is_top_level_yaml_key(line: &str) -> bool {
    let trimmed = line.trim();
    !trimmed.is_empty()
        && !trimmed.starts_with('#')
        && !line.starts_with(char::is_whitespace)
        && !trimmed.starts_with('-')
        && trimmed.contains(':')
}

fn append_by_yaml_round_trip(content: &str, item_yaml: &str) -> Result<String, String> {
    let mut doc: Value =
        serde_yaml::from_str(content).map_err(|e| format!("YAML parse error: {}", e))?;
    let new_item: Vec<Value> = serde_yaml::from_str(item_yaml)
        .map_err(|e| format!("Generated YAML parse error: {}", e))?;
    let new_item = new_item
        .into_iter()
        .next()
        .ok_or_else(|| "Generated snippet was empty".to_string())?;

    match doc.get_mut("matches").and_then(Value::as_sequence_mut) {
        Some(matches) => matches.push(new_item),
        None => {
            let Some(mapping) = doc.as_mapping_mut() else {
                return Err("YAML root must be a map before snippets can be added.".to_string());
            };
            mapping.insert(
                Value::String("matches".to_string()),
                Value::Sequence(vec![new_item]),
            );
        }
    }

    serde_yaml::to_string(&doc).map_err(|e| format!("Failed to serialize YAML: {}", e))
}

fn indent_yaml_item(item_yaml: &str) -> String {
    item_yaml
        .lines()
        .map(|line| format!("  {}", line))
        .collect::<Vec<_>>()
        .join("\n")
}

fn restart_espanso() -> Result<(), String> {
    match Command::new("espanso").arg("restart").output() {
        Ok(output) if output.status.success() => Ok(()),
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            if is_benign_restart_output(&stdout, &stderr) {
                return Ok(());
            }

            if stderr.trim().is_empty() {
                Err(format!("espanso restart exited with {}", output.status))
            } else {
                Err(stderr.trim().to_string())
            }
        }
        Err(e) => Err(format!(
            "Auto-restart failed (is espanso CLI installed?): {}",
            e
        )),
    }
}

fn is_benign_restart_output(stdout: &str, stderr: &str) -> bool {
    let output = format!("{}\n{}", stdout, stderr).to_ascii_lowercase();
    output.contains("unable to stop espanso") && output.contains("espanso is already running")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text_options(trigger: &str, content: &str, config: PathBuf) -> AddSnippetOptions {
        AddSnippetOptions {
            mode: SnippetMode::Text,
            trigger: trigger.to_string(),
            content: content.to_string(),
            description: Some("Greeting".to_string()),
            config: config.to_string_lossy().to_string(),
            match_dir: None,
            restart: false,
        }
    }

    #[test]
    fn appends_text_snippet_to_existing_matches_block() {
        let content = "global_vars:\n  - name: x\nmatches:\n  - trigger: :old\n    replace: Old\n";
        let item =
            snippet_to_yaml_item(&text_options(":hello", "Hello", PathBuf::from("base.yml")))
                .unwrap();

        let updated = append_match_to_yaml_content(content, &item).unwrap();

        assert!(updated.contains("global_vars:\n  - name: x\nmatches:\n  - trigger: :old\n    replace: Old\n\n  - trigger: :hello\n    replace: Hello\n    description: Greeting\n"));
    }

    #[test]
    fn inserts_before_next_top_level_key() {
        let content = "matches:\n  - trigger: :old\n    replace: Old\nbackend: Clipboard\n";
        let item =
            snippet_to_yaml_item(&text_options(":hello", "Hello", PathBuf::from("base.yml")))
                .unwrap();

        let updated = append_match_to_yaml_content(content, &item).unwrap();

        assert!(updated.contains("  - trigger: :hello\n    replace: Hello\n    description: Greeting\n\nbackend: Clipboard"));
    }

    #[test]
    fn allows_duplicate_trigger() {
        let content = "matches:\n  - triggers:\n      - :hello\n    replace: Hello\n";

        assert!(validate_yaml_for_append(content, ":hello").is_ok());
    }

    #[test]
    fn writes_file_mode_as_shell_cat_var() {
        let options = AddSnippetOptions {
            mode: SnippetMode::File,
            trigger: ":file".to_string(),
            content: "/tmp/demo.txt".to_string(),
            description: None,
            config: "base.yml".to_string(),
            match_dir: None,
            restart: false,
        };

        let item = snippet_to_yaml_item(&options).unwrap();

        assert!(item.contains("replace: '{{output}}'") || item.contains("replace: \"{{output}}\""));
        assert!(item.contains("cmd: cat \"/tmp/demo.txt\""));
    }

    #[test]
    fn writes_multiline_text_with_valid_match_indentation() {
        let item = snippet_to_yaml_item(&text_options(
            ":multi",
            "first line\nsecond line",
            PathBuf::from("base.yml"),
        ))
        .unwrap();
        let yaml = format!("matches:\n{}\n", indent_yaml_item(&item));
        let parsed: Value = serde_yaml::from_str(&yaml).unwrap();

        assert!(yaml.contains("  - trigger: :multi\n    replace: |-\n      first line\n      second line\n    description: Greeting\n"));
        assert_eq!(
            parsed["matches"][0]["replace"].as_str(),
            Some("first line\nsecond line")
        );
    }

    #[test]
    fn add_snippet_creates_base_file() {
        let temp = tempfile::tempdir().unwrap();
        let target = temp.path().join("base.yml");
        let options = text_options(":new", "New text", target.clone());

        let result = add_snippet(options).unwrap();
        let written = fs::read_to_string(&target).unwrap();

        assert_eq!(result.target_path, target);
        assert!(written.contains("matches:\n  - trigger: :new\n    replace: New text"));
    }

    #[test]
    fn treats_espanso_already_running_restart_output_as_benign() {
        assert!(is_benign_restart_output(
            "",
            "unable to stop espanso: ipc error: `Connection refused (os error 61)`\nespanso is already running!"
        ));
        assert!(!is_benign_restart_output("", "espanso restart failed"));
    }
}
