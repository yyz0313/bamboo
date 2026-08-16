// Tauri build script - copy frontend dist before packaging
use std::process::Command;
use std::path::PathBuf;

fn main() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .to_path_buf();

    let ui_dist = root.join("src").join("dist");
    let tauri_dist = root.join("src").join("dist");

    // Ensure UI dist exists (vite build should have run)
    if !ui_dist.exists() {
        eprintln!("[bamboo] Warning: src/dist not found. Run 'pnpm build:ui' first.");
    }

    // Let Tauri handle the rest
    println!("cargo:rerun-if-changed=../src/dist");
}
