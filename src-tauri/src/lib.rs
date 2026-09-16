#[cfg(test)]
pub mod test_util;

pub(crate) mod calibre;
pub mod catalog;
pub mod commands;
pub mod config;
pub mod constants;
pub mod import;
pub mod library;
pub mod plugin;
pub mod reading;

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use tauri::Manager;

use crate::catalog::open_catalog;
use crate::config::AppConfig;
use crate::constants::DEMO_PLUGIN_DIR;
use crate::library::Library;
use crate::plugin::PluginRuntime;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let config = AppConfig::load()?;
            let library_root = config.library_dir;
            let mut library = Library::open(&library_root)?;
            open_catalog(library.connection_mut())?;
            let mut runtime = if library.mode() == crate::library::LibraryMode::Portable {
                seed_demo_plugin(&library)?;
                PluginRuntime::load(library.plugins_dir_abs().as_path())?
            } else {
                PluginRuntime::empty()
            };
            for name in runtime.plugin_names() {
                println!("[plugins] загружен плагин: {name}");
            }
            if runtime.plugin_names().iter().any(|n| n == DEMO_PLUGIN_DIR) {
                match runtime.invoke(DEMO_PLUGIN_DIR, r#"{"title":"BookLib"}"#) {
                    Ok(output) => println!("[plugins] demo-plugin ответил: {output}"),
                    Err(err) => println!("[plugins] demo-plugin завершился с ошибкой: {err}"),
                }
            }

            app.manage(Mutex::new(library));
            app.manage(Mutex::new(runtime));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::import_book,
            commands::list_books,
            commands::get_cover,
            commands::get_book_content,
            commands::get_library_info,
            commands::open_book_in_system,
            commands::open_library,
            commands::search_books,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Копирование demo-плагина из ресурсов приложения в библиотеку
/// при первом старте.
fn seed_demo_plugin(library: &Library) -> Result<(), Box<dyn std::error::Error>> {
    let source = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("plugins")
        .join(DEMO_PLUGIN_DIR);
    let destination = library.plugins_dir_abs().join(DEMO_PLUGIN_DIR);
    if destination.exists() {
        return Ok(());
    }
    fs::create_dir_all(&destination)?;
    for file in ["plugin-manifest.json", "demo_plugin.wasm"] {
        let file_path = source.join(file);
        if file_path.exists() {
            fs::copy(&file_path, destination.join(file))?;
        }
    }
    Ok(())
}
