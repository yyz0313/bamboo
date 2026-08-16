// Bamboo Tauri 桌面壳
// 启动 Python bridge 进程 + 加载前端 UI
use tauri::{Manager, WindowEvent};
use std::process::{Command, Stdio};
use std::path::PathBuf;

#[derive(serde::Deserialize, Clone)]
struct BridgeConfig {
    port: u16,
    #[serde(default)]
    mock: bool,
}

impl Default for BridgeConfig {
    fn default() -> Self {
        Self { port: 18720, mock: false }
    }
}

// 获取 bamboo 根目录（与 src-tauri 同级的父目录）
fn bamboo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .to_path_buf()
}

// 查找 Python 可执行文件
fn find_python() -> PathBuf {
    // 优先使用 WorkBuddy 管理的 Python
    let wb_python = PathBuf::from("C:/Users/yyz20/AppData/Local/Programs/Python/Python312/python.exe");
    if wb_python.exists() {
        return wb_python;
    }
    let wb_python3 = PathBuf::from("C:/Users/yyz20/.workbuddy/binaries/python/versions/3.13.12/python.exe");
    if wb_python3.exists() {
        return wb_python3;
    }
    // 回退到系统 Python
    PathBuf::from("python")
}

// 启动 Python bridge 子进程
fn start_bridge(config: BridgeConfig) -> std::process::Child {
    let root = bamboo_root();
    let python = find_python();
    let bridge_script = root.join("bridge").join("main.py");

    println!("[bamboo] Starting bridge: {} {}", python.display(), bridge_script.display());

    let mut cmd = Command::new(python);
    cmd.arg(bridge_script.as_os_str())
       .arg("--port")
       .arg(config.port.to_string())
       .current_dir(&root)
       .stdout(Stdio::piped())
       .stderr(Stdio::piped());

    if config.mock {
        cmd.env("BAMBOO_MOCK", "1");
    }

    cmd.spawn().expect("Failed to start bridge process")
}

#[tauri::command]
fn get_bridge_port() -> u16 {
    18720
}

#[tauri::command]
fn get_runtime_mode() -> String {
    // 检查是否有 dsh 可执行文件
    let root = bamboo_root();
    let runtime_dir = root.join("vendor").join("deepseek-harness")
        .join("python").join("sdk-runtime")
        .join("src").join("deepseek_harness_runtime")
        .join("runtime");

    if runtime_dir.exists() {
        let exe_files: Vec<_> = std::fs::read_dir(&runtime_dir)
            .unwrap_or_default()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().starts_with("dsh-jsonrpc-agent"))
            .collect();
        if !exe_files.is_empty() {
            return "real".to_string();
        }
    }
    "mock".to_string()
}

fn main() {
    let config = BridgeConfig::default();

    // 启动 bridge 进程（不等待它）
    let _bridge = start_bridge(config.clone());

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![get_bridge_port, get_runtime_mode])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
