#[cfg(test)]
pub mod test_util;

pub mod commands;
pub mod constants;
pub mod library_history;
pub mod plugin;
pub mod workspace_state;

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::Manager;

use crate::constants::{
    resolve_app_state_root, resolve_user_plugins_root, BASE_PLUGINS_DIR_NAME, PLUGINS_DIR_NAME,
};
use crate::plugin::{AppPluginHost, AppState, PluginSession, ReaderConfig};

/// Точка входа Tauri-приложения и generic plugin host.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            plugin::relay::set_app_handle(app.handle().clone());

            let resource_dir = app.path().resource_dir()?;
            let app_data_dir = app.path().app_data_dir().ok();
            let user_plugins_dir = resolve_user_plugins_root(app_data_dir.as_deref());
            let app_state_root = resolve_app_state_root(app_data_dir.as_deref());

            let bundled_plugins_dir = resource_dir.join(PLUGINS_DIR_NAME);
            let bundled_base = resource_dir.join(BASE_PLUGINS_DIR_NAME);
            let wasm_cache = crate::plugin::wasm_cache::prepare(&app_state_root);
            let mut app_host = AppPluginHost::load_with_cache(
                &base_plugin_directories(&bundled_base),
                base_storage_root(),
                wasm_cache.as_deref(),
            )?;
            app_host.set_plugin_store_root(user_plugins_dir.clone());
            app_host.set_activation_root(app_state_root.clone());
            app_host.set_catalog_dirs(session_plugin_directories(
                &bundled_plugins_dir,
                &user_plugins_dir,
            ));
            let _ = app_host.reset_notifications();
            let _ = app_host.refresh_settings_registry(&[]);
            app_host.refresh_log_level();
            if app_host.welcome_notification_enabled() {
                app_host.notify_user(
                    crate::plugin::Severity::Info,
                    "Добро пожаловать в «Текстуру»",
                    "app",
                    serde_json::json!({}),
                );
            }

            // Прогрев source-плагинов идёт в фоне: первое открытие библиотеки
            // не должно ждать компиляции WASM.
            let warmup_directories =
                session_plugin_directories(&bundled_plugins_dir, &user_plugins_dir);

            let root = PathBuf::from(".");
            let mut host = PluginSession::idle(root, bundled_plugins_dir.clone());
            host.set_user_plugins_dir(user_plugins_dir.clone());
            host.set_wasm_cache(wasm_cache.clone());
            let disabled = crate::plugin::activation::load(&app_state_root).unwrap_or_default();
            host.set_disabled_plugins(disabled.clone());
            host.mark_activation_applied();

            // Runtime чтения книг рабочим местом собирается отдельно от сессии
            // библиотеки: книга открывается по вложению (пути) и не зависит от
            // того, открыта ли библиотека и откуда взята книга.
            let reader_config = ReaderConfig {
                directories: session_plugin_directories(&bundled_plugins_dir, &user_plugins_dir),
                disabled,
                storage_root: app_state_root.clone(),
                cache: wasm_cache.clone(),
            };

            app.manage(Mutex::new(AppState::new(
                host,
                app_host,
                app_state_root,
                reader_config,
            )));

            crate::plugin::warmup::spawn_source_warmup(warmup_directories, wasm_cache);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::invoke_plugin_operation,
            commands::invoke_base_plugin_operation,
            commands::select_source_library,
            commands::active_library,
            commands::library_history_list,
            commands::library_history_forget,
            commands::get_workspaces,
            commands::save_workspaces,
            commands::plugin_activation_pending,
            commands::reader_formats,
            commands::reader_plugin_for_format,
            commands::reader_viewer,
            commands::reader_content,
            commands::reader_open_external,
            commands::reader_book_chunk,
            commands::reader_forget_book,
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

/// Директории session-плагинов для перечня стора: поставляемая, пользовательская
/// и ресурсная для разработки.
fn session_plugin_directories(bundled: &Path, user: &Path) -> Vec<PathBuf> {
    let mut directories = vec![bundled.to_path_buf(), user.to_path_buf()];
    let development = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join(PLUGINS_DIR_NAME);
    if development != *bundled && development.is_dir() {
        directories.push(development);
    }
    directories
}
