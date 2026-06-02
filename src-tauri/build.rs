fn main() {
    println!("cargo:rerun-if-changed=../dist-gui");
    register_frontend_dist_files("../dist-gui");
    tauri_build::build()
}

fn register_frontend_dist_files(path: &str) {
    let Ok(entries) = std::fs::read_dir(path) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(path) = path.to_str() {
                register_frontend_dist_files(path);
            }
            continue;
        }

        if let Some(path) = path.to_str() {
            println!("cargo:rerun-if-changed={path}");
        }
    }
}
