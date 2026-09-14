mod args;

use std::path::Path;
use std::sync::Mutex;

use serde::Serialize;
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, Manager, State};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_dialog::DialogExt;

pub use args::parse_open_path;

#[derive(Default)]
pub struct OpenedState {
    path: Mutex<Option<String>>,
    recent: Mutex<Vec<String>>,
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
        *guard = Some(path.clone());
    }
    if let Ok(mut recent) = state.recent.lock() {
        recent.retain(|p| p != &path);
        recent.insert(0, path);
        recent.truncate(8);
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

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn pick_open_path(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let picked = app.dialog().file().add_filter("All", &["*"]).blocking_pick_file();
    Ok(picked.map(|p| p.to_string()))
}

#[tauri::command]
fn recent_files(state: State<'_, OpenedState>) -> Result<Vec<String>, String> {
    state
        .recent
        .lock()
        .map(|g| g.clone())
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_deep_link::init())
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
            pick_save_path,
            read_text_file,
            pick_open_path,
            recent_files
        ])
        .setup(|app| {
            let file_open = MenuItemBuilder::with_id("file_open", "Öffnen…")
                .accelerator("CmdOrCtrl+O")
                .build(app)?;
            let load_license = MenuItemBuilder::with_id("load_license", "Lizenz-Token laden…").build(app)?;
            let load_presets = MenuItemBuilder::with_id("load_presets", "Team-Presets laden…").build(app)?;
            let tools_home = MenuItemBuilder::with_id("tools_home", "Werkzeuge").build(app)?;
            let about = MenuItemBuilder::with_id("about", "Über NeoTools").build(app)?;
            let file_menu = SubmenuBuilder::new(app, "Datei")
                .item(&file_open)
                .item(&PredefinedMenuItem::separator(app)?)
                .item(&load_license)
                .item(&load_presets)
                .build()?;
            let tools_menu = SubmenuBuilder::new(app, "Werkzeuge").item(&tools_home).build()?;
            let help_menu = SubmenuBuilder::new(app, "Hilfe").item(&about).build()?;
            let menu = MenuBuilder::new(app)
                .item(&file_menu)
                .item(&tools_menu)
                .item(&help_menu)
                .build()?;
            app.set_menu(menu)?;
            let _tray = TrayIconBuilder::new()
                .tooltip("NeoTools")
                .on_tray_icon_event(|tray, _event| {
                    if let Some(window) = tray.app_handle().get_webview_window("main") {
                        let _ = window.unminimize();
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                })
                .build(app)?;
            app.on_menu_event(|app, event| {
                match event.id().as_ref() {
                    "file_open" => {
                        if let Some(path) = app
                            .dialog()
                            .file()
                            .add_filter("PDF", &["pdf"])
                            .blocking_pick_file()
                        {
                            apply_open_path(app, path.to_string());
                        }
                    }
                    "load_license" => {
                        if let Some(path) = app
                            .dialog()
                            .file()
                            .add_filter("License", &["txt", "json", "lic"])
                            .blocking_pick_file()
                        {
                            if let Ok(text) = std::fs::read_to_string(path.to_string()) {
                                let _ = app.emit("load-license-token", text);
                            }
                        }
                    }
                    "load_presets" => {
                        if let Some(path) = app
                            .dialog()
                            .file()
                            .add_filter("Presets", &["json"])
                            .blocking_pick_file()
                        {
                            if let Ok(text) = std::fs::read_to_string(path.to_string()) {
                                let _ = app.emit("load-team-presets", text);
                            }
                        }
                    }
                    "tools_home" => {
                        let _ = app.emit("navigate", "/");
                    }
                    "about" => {
                        let _ = app.emit("about", "NeoTools Desktop 0.1.0");
                    }
                    _ => {}
                }
            });
            let handle = app.handle().clone();
            handle.deep_link().on_open_url({
                let handle = handle.clone();
                move |event| {
                    for url in event.urls() {
                        let _ = handle.emit("open-deep-link", url.to_string());
                    }
                }
            });
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
