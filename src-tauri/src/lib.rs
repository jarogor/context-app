#[cfg(test)]
pub mod test_util;

pub mod commands;
pub mod config;
pub mod constants;
pub mod journal;
pub mod plugin;

use std::sync::Mutex;

use tauri::Manager;

use crate::config::AppConfig;
use crate::constants::DEMO_PLUGIN_NAME;
use crate::journal::Severity;
use crate::plugin::PluginSession;

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
            let storage_root = app.path().app_data_dir()?.join("source-state");
            let mut library = PluginSession::idle(library_root, bundled_plugins_dir, storage_root);
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
