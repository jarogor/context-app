#[cfg(test)]
pub mod test_util;

pub mod catalog;
pub mod commands;
pub mod config;
pub mod constants;
pub mod import;
pub mod journal;
pub mod library;
pub mod plugin;
pub mod reading;

use std::sync::Mutex;

use tauri::Manager;

use crate::catalog::open_catalog;
use crate::config::AppConfig;
use crate::constants::DEMO_PLUGIN_NAME;
use crate::journal::{get_journal_handle, Severity};
use crate::library::Library;

/// Точка входа Tauri-приложения: конфигурация, библиотека и плагины.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            crate::journal::set_journal_handle(crate::journal::JournalHandle::new());
            crate::journal::set_app_handle(app.handle().clone());

            let config = AppConfig::load()?;
            let library_root = config.library_dir;
            let bundled_plugins_dir = app.path().resource_dir()?.join("plugins");
            let mut library = if library_root.is_dir() {
                Library::open_for_selection(&library_root, bundled_plugins_dir.clone())?
            } else {
                Library::open(&library_root, bundled_plugins_dir.clone())?
            };
            open_catalog(library.connection_mut())?;
            for name in library.runtime().plugin_names() {
                let handle = crate::journal::get_journal_handle();
                handle.add_technical("plugin loaded", name, serde_json::json!({}));
            }
            if library
                .runtime()
                .plugin_names()
                .iter()
                .any(|n| n == DEMO_PLUGIN_NAME)
            {
                match library
                    .runtime_mut()
                    .invoke(DEMO_PLUGIN_NAME, r#"{"title":"BookLib"}"#)
                {
                    Ok(output) => {
                        let handle = crate::journal::get_journal_handle();
                        handle.add_user(
                            "demo answered",
                            Severity::Info,
                            "plugin",
                            serde_json::json!({ "output": output }),
                        );
                    }
                    Err(err) => {
                        let handle = crate::journal::get_journal_handle();
                        handle.add_technical(
                            "demo error",
                            DEMO_PLUGIN_NAME,
                            serde_json::json!({ "error": err.to_string() }),
                        );
                    }
                }
            }

            app.manage(Mutex::new(library));

            let app_clone = app.handle().clone();
            tauri::async_runtime::spawn_blocking(move || {
                use tauri::Emitter;
                if let Ok(mut current) = app_clone.state::<Mutex<Library>>().lock() {
                    current.set_stage("scanning");
                }
                let _ = app_clone.emit("library-progress", "scanning");
                let prepared = Library::prepare_selected(&library_root, bundled_plugins_dir);
                if let Ok((is_external, connection, source)) = prepared {
                    if let Ok(mut current) = app_clone.state::<Mutex<Library>>().lock() {
                        current.set_stage("indexing");
                    }
                    let _ = app_clone.emit("library-progress", "indexing");
                    if let Ok(mut current) = app_clone.state::<Mutex<Library>>().lock() {
                        let result = if is_external {
                            current.promote_external(connection, source.expect("имя источника"))
                        } else {
                            current.install_portable(connection);
                            Ok(())
                        };
                        if result.is_ok() {
                            let _ = app_clone.emit("library-progress", "ready");
                            let _ = app_clone.emit("library-catalog-changed", ());
                        } else if let Err(error) = result {
                            let handle = get_journal_handle();
                            handle.add_technical(
                                "open library error",
                                library_root.display().to_string(),
                                serde_json::json!({ "error": error.to_string() }),
                            );
                            if let Ok(mut current) = app_clone.state::<Mutex<Library>>().lock() {
                                current.set_stage("error");
                            }
                            let _ = app_clone.emit("library-open-error", error.to_string());
                        }
                    }
                } else if let Err(error) = prepared {
                    let handle = get_journal_handle();
                    handle.add_technical(
                        "open library error",
                        library_root.display().to_string(),
                        serde_json::json!({ "error": error.to_string() }),
                    );
                    if let Ok(mut current) = app_clone.state::<Mutex<Library>>().lock() {
                        current.set_stage("error");
                    }
                    let _ = app_clone.emit("library-open-error", error.to_string());
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::import_book,
            commands::list_books,
            commands::get_cover,
            commands::get_book_content,
            commands::list_cached_libraries,
            commands::get_library_info,
            commands::open_book_in_system,
            commands::open_library,
            commands::invoke_library_operation,
            commands::search_books,
            crate::journal::commands::list_journal,
            crate::journal::commands::mark_read,
            crate::journal::commands::mark_all_read,
            crate::journal::commands::clear_journal,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
