#[cfg(test)]
pub mod test_util;

pub mod commands;
pub mod constants;
pub mod plugin;

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::Manager;

use crate::constants::{BASE_PLUGINS_DIR_NAME, DEMO_PLUGIN_NAME, PLUGINS_DIR_NAME};
use crate::plugin::{AppPluginHost, AppState, PluginSession};

/// Точка входа Tauri-приложения и generic plugin host.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            plugin::relay::set_app_handle(app.handle().clone());

            let resource_dir = app.path().resource_dir()?;

            let bundled_base = resource_dir.join(BASE_PLUGINS_DIR_NAME);
            let mut app_host =
                AppPluginHost::load(&base_plugin_directories(&bundled_base), base_storage_root())?;
            let _ = app_host.reset_notifications();
            for name in app_host.plugin_names() {
                app_host.notify_technical(
                    format!("Базовый плагин загружен: {name}"),
                    "plugins",
                    serde_json::json!({ "plugin": name }),
                );
            }

            let _ = app_host.refresh_settings_registry(&[]);
            if app_host.welcome_notification_enabled() {
                app_host.notify_user("Добро пожаловать в BookLib", "app", serde_json::json!({}));
            }

            let root = PathBuf::from(".");
            let bundled_plugins_dir = resource_dir.join(PLUGINS_DIR_NAME);
            let mut host = PluginSession::idle(root, bundled_plugins_dir);
            for name in host.runtime().plugin_names() {
                app_host.notify_technical(
                    format!("Плагин библиотеки загружен: {name}"),
                    "plugins",
                    serde_json::json!({ "plugin": name }),
                );
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
                        app_host.notify_user(
                            "demo answered",
                            "plugin",
                            serde_json::json!({ "output": output }),
                        );
                    }
                    Err(err) => {
                        app_host.notify_technical(
                            "demo error",
                            DEMO_PLUGIN_NAME,
                            serde_json::json!({ "error": err.to_string() }),
                        );
                    }
                }
            }

            app.manage(Mutex::new(AppState::new(host, app_host)));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::invoke_plugin_operation,
            commands::invoke_base_plugin_operation,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Директории базовых плагинов: поставляемая и ресурсная для разработки.
fn base_plugin_directories(bundled: &Path) -> Vec<PathBuf> {
    let mut directories = vec![bundled.to_path_buf()];
    let development = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join(BASE_PLUGINS_DIR_NAME);
    if development != bundled && development.is_dir() {
        directories.push(development);
    }
    directories
}

/// Корень служебного хранилища базовых плагинов в рабочей директории проекта.
fn base_storage_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("родитель папки src-tauri")
        .join("dev_data")
        .join(BASE_PLUGINS_DIR_NAME)
}
