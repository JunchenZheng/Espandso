use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::Emitter;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn execute_shell_cmd(cmd: String) -> Result<String, String> {
    use std::process::Command;

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut c = Command::new("cmd");
        c.args(["/C", &cmd]);
        c
    };

    #[cfg(not(target_os = "windows"))]
    let mut command = {
        let mut c = Command::new("sh");
        c.args(["-c", &cmd]);
        c
    };

    let output = command.output().map_err(|e| e.to_string())?;

    if output.status.success() {
        String::from_utf8(output.stdout).map_err(|e| e.to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(if stderr.trim().is_empty() {
            format!("Command exited with status code: {}", output.status)
        } else {
            stderr.to_string()
        })
    }
}

fn menu_text(locale: &str, key: &'static str) -> &'static str {
    match (locale, key) {
        ("zh-CN", "about") => "关于 Expandso",
        ("zh-CN", "file") => "文件",
        ("zh-CN", "edit") => "编辑",
        ("zh-CN", "window") => "窗口",
        ("zh-CN", "help") => "帮助",

        (_, "about") => "About Expandso",
        (_, "file") => "File",
        (_, "edit") => "Edit",
        (_, "window") => "Window",
        (_, "help") => "Help",
        _ => key,
    }
}

fn build_app_menu(app: &tauri::AppHandle, locale: &str) -> tauri::Result<Menu<tauri::Wry>> {
    let about_item = MenuItem::with_id(app, "open_about", menu_text(locale, "about"), true, None::<&str>)?;

    #[cfg(target_os = "macos")]
    {
        let app_submenu = Submenu::with_items(
            app,
            "Expandso",
            true,
            &[
                &about_item,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::services(app, None)?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::hide(app, None)?,
                &PredefinedMenuItem::hide_others(app, None)?,
                &PredefinedMenuItem::show_all(app, None)?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::quit(app, None)?,
            ],
        )?;

        let edit_submenu = Submenu::with_items(
            app,
            menu_text(locale, "edit"),
            true,
            &[
                &PredefinedMenuItem::undo(app, None)?,
                &PredefinedMenuItem::redo(app, None)?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::cut(app, None)?,
                &PredefinedMenuItem::copy(app, None)?,
                &PredefinedMenuItem::paste(app, None)?,
                &PredefinedMenuItem::select_all(app, None)?,
            ],
        )?;

        let window_submenu = Submenu::with_items(
            app,
            menu_text(locale, "window"),
            true,
            &[
                &PredefinedMenuItem::minimize(app, None)?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::close_window(app, None)?,
            ],
        )?;

        Menu::with_items(app, &[&app_submenu, &edit_submenu, &window_submenu])
    }

    #[cfg(not(target_os = "macos"))]
    {
        let file_submenu = Submenu::with_items(
            app,
            menu_text(locale, "file"),
            true,
            &[&PredefinedMenuItem::quit(app, None)?],
        )?;

        let edit_submenu = Submenu::with_items(
            app,
            menu_text(locale, "edit"),
            true,
            &[
                &PredefinedMenuItem::undo(app, None)?,
                &PredefinedMenuItem::redo(app, None)?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::cut(app, None)?,
                &PredefinedMenuItem::copy(app, None)?,
                &PredefinedMenuItem::paste(app, None)?,
                &PredefinedMenuItem::select_all(app, None)?,
            ],
        )?;

        let help_submenu = Submenu::with_items(
            app,
            menu_text(locale, "help"),
            true,
            &[&about_item],
        )?;

        Menu::with_items(app, &[&file_submenu, &edit_submenu, &help_submenu])
    }
}

#[tauri::command]
fn set_app_language(app: tauri::AppHandle, locale: String) -> Result<(), String> {
    let menu = build_app_menu(&app, &locale).map_err(|e| e.to_string())?;
    app.set_menu(menu).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            let menu = build_app_menu(app.handle(), "en")?;
            app.set_menu(menu)?;
            Ok(())
        })

        .on_menu_event(|app, event| {
            if event.id() == "open_about" {
                let _ = app.emit("open-about-dialog", ());
            }
        })
        .invoke_handler(tauri::generate_handler![greet, execute_shell_cmd, set_app_language])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

