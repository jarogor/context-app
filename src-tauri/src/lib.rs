#[cfg(test)]
pub mod test_util;

pub mod commands;
pub mod config;
pub mod constants;
pub mod journal;
pub mod plugin;

use std::sync::Mutex;

use tauri::Manager;

use crate::constants::DEMO_PLUGIN_NAME;
use crate::journal::Severity;
use crate::plugin::PluginHostSession;

/// Точка входа Tauri-приложения и generic plugin host.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            crate::journal::set_journal_handle(crate::journal::JournalHandle::new());
            crate::journal::set_app_handle(app.handle().clone());

            let root = std::path::PathBuf::from(".");
            let bundled_plugins_dir = app.path().resource_dir()?.join("plugins");
            let storage_root = crate::config::app_state_dir(app.handle())?.join("source-state");
            let mut host = PluginHostSession::idle(root, bundled_plugins_dir, storage_root);
            for name in host.runtime().plugin_names() {
                let handle = crate::journal::get_journal_handle();
                handle.add_technical("plugin loaded", name, serde_json::json!({}));
            }
            if host
                .runtime()
                .plugin_names()
                .iter()
                .any(|n| n == DEMO_PLUGIN_NAME)
            {
                match host
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

            app.manage(Mutex::new(host));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::invoke_plugin_operation,
            commands::open_source,
            commands::get_source_info,
            crate::journal::commands::list_journal,
            crate::journal::commands::mark_read,
            crate::journal::commands::mark_all_read,
            crate::journal::commands::clear_journal,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
