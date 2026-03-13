// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    match expandso_lib::cli::try_run_cli_from_env() {
        Ok(true) => return,
        Ok(false) => {}
        Err(error) => {
            eprintln!("Expandso CLI error: {}", error);
            std::process::exit(1);
        }
    }

    expandso_lib::run()
}
