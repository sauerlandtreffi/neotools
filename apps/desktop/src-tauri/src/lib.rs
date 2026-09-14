mod args;

use std::path::Path;
use std::sync::Mutex;

use serde::Serialize;
use tauri::{Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

pub use args::parse_open_path;

#[derive(Default)]
pub struct OpenedState {
    path: Mutex<Option<String>>,
}

#[derive(Serialize, Clone)]
pub struct OpenedNotice {
    pub name: String,
    pub path: String,
}

#[derive(Serialize)]
pub struct OpenedFile {
    pub name: String,
    pub path: String,
    pub bytes: Vec<u8>,
}

fn file_name(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("document.pdf")
        .to_string()
}

fn set_pending(state: &OpenedState, path: String) {
    if let Ok(mut guard) = state.path.lock() {
        *guard = Some(path);
    }
}

fn emit_open(app: &tauri::AppHandle, path: &str) {
    let _ = app.emit(
        "open-file",
        OpenedNotice {
            name: file_name(path),
            path: path.to_string(),
        },
    );
}

fn apply_open_path(app: &tauri::AppHandle, path: String) {
    if let Some(state) = app.try_state::<OpenedState>() {
        set_pending(state.inner(), path.clone());
    }
    emit_open(app, &path);
}

fn handle_startup_args(app: &tauri::AppHandle, args: &[String]) {
    if let Some(path) = parse_open_path(args) {
        apply_open_path(app, path);
        return;
    }
    for arg in args.iter().skip(1) {
        if arg.starts_with("neotools:") {
            let _ = app.emit("open-deep-link", arg);
        }
    }
}

fn read_path(path: String) -> Result<OpenedFile, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    Ok(OpenedFile {
        name: file_name(&path),
        path,
        bytes,
    })
}

#[tauri::command]
fn read_file(path: String) -> Result<OpenedFile, String> {
    read_path(path)
}

#[tauri::command]
fn read_opened_file(state: State<'_, OpenedState>) -> Result<OpenedFile, String> {
    let path = state
        .path
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or_else(|| "no opened file".to_string())?;
    read_path(path)
}

#[tauri::command]
fn save_file(path: String, bytes: Vec<u8>) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    std::fs::write(path, bytes).map_err(|e| e.to_string())
}

#[tauri::command]
fn pick_save_path(app: tauri::AppHandle, default_name: Option<String>) -> Result<Option<String>, String> {
    let mut dialog = app.dialog().file().add_filter("PDF", &["pdf"]);
    if let Some(name) = default_name.as_deref() {
        dialog = dialog.set_file_name(name);
    }
    let picked = dialog.blocking_save_file();
    Ok(picked.map(|p| p.to_string()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            handle_startup_args(app, &argv);
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .manage(OpenedState::default())
        .invoke_handler(tauri::generate_handler![
            read_file,
            read_opened_file,
            save_file,
            pick_save_path
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let args: Vec<String> = std::env::args().collect();
            if parse_open_path(&args).is_some() || args.iter().any(|a| a.starts_with("neotools:")) {
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(500));
                    handle_startup_args(&handle, &args);
                });
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building NeoTools")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            handle_macos_opened(app, &event);
            let _ = (app, &event);
        });
}

#[cfg(target_os = "macos")]
fn handle_macos_opened(app: &tauri::AppHandle, event: &tauri::RunEvent) {
    if let tauri::RunEvent::Opened { urls } = event {
        for url in urls {
            let raw = url.to_string();
            if raw.starts_with("neotools:") {
                let _ = app.emit("open-deep-link", raw);
                continue;
            }
            if let Ok(path) = url.to_file_path() {
                apply_open_path(app, path.to_string_lossy().into_owned());
            } else if let Some(path) = parse_open_path(&["app".to_string(), raw]) {
                apply_open_path(app, path);
            }
        }
    }
}
