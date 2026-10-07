#[cfg(test)]
pub mod test_util;

pub mod atomic_file;
pub mod commands;
pub mod constants;
pub mod library_history;
pub mod paths;
pub mod plugin;
pub mod workspace_state;

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::Manager;

use crate::constants::{
    resolve_app_state_root, resolve_user_plugins_root, APP_DISPLAY_NAME, BASE_PLUGINS_DIR_NAME,
    PLUGINS_DIR_NAME,
};
use crate::plugin::{AppHostConfig, AppInfo, AppState, PluginSession, ReaderConfig};

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

            // Тяжёлая загрузка и компиляция WASM базовых плагинов намеренно НЕ
            // выполняется здесь: иначе окно остаётся белым, пока компилятор
            // плагинов работает. Runtime базовых плагинов собирается лениво, при
            // первом обращении, уже под экраном загрузки.
            let app_host_config = AppHostConfig {
                directories: base_plugin_directories(&bundled_base),
                storage_root: base_storage_root(),
                user_plugins_dir: user_plugins_dir.clone(),
                activation_root: app_state_root.clone(),
                catalog_dirs: session_plugin_directories(&bundled_plugins_dir, &user_plugins_dir),
                cache: wasm_cache.clone(),
            };

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

            let app_info = AppInfo::build(
                APP_DISPLAY_NAME,
                app.package_info().version.to_string(),
                &app_state_root,
                &user_plugins_dir,
                &bundled_plugins_dir,
                &bundled_base,
            );

            app.manage(Mutex::new(AppState::new(
                host,
                app_state_root,
                app_info,
                reader_config,
                app_host_config,
            )));

            // Окно создано скрытым: его показывает интерфейс после первой
            // отрисовки. Страховка на случай, если интерфейс не загрузился.
            if let Some(window) = app.get_webview_window("main") {
                crate::commands::show_window::schedule_fallback_show(window);
            }

            crate::plugin::warmup::spawn_source_warmup(warmup_directories, wasm_cache);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::invoke_plugin_operation,
            commands::invoke_base_plugin_operation,
            commands::app_info,
            commands::select_source_library,
            commands::active_library,
            commands::library_history_list,
            commands::library_history_forget,
            commands::get_workspaces,
            commands::save_workspaces,
            commands::plugin_activation_pending,
            commands::theme_preference,
            commands::theme_palette,
            commands::show_window,
            commands::reader_formats,
            commands::reader_plugin_for_format,
            commands::reader_viewer,
            commands::reader_viewer_files,
            commands::reader_viewer_file,
            commands::reader_content,
            commands::reader_open_external,
            commands::reader_book_chunk,
            commands::reader_forget_book,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Директории базовых плагинов в порядке приоритета.
///
/// Ресурсы рабочей копии идут раньше копии в каталоге сборки: свежая сборка
/// плагина не должна перекрываться устаревшей копией в `target`.
fn base_plugin_directories(bundled: &Path) -> Vec<PathBuf> {
    let mut directories = Vec::new();
    let development = crate::paths::resources_dir().join(BASE_PLUGINS_DIR_NAME);
    if development != bundled && development.is_dir() {
        directories.push(development);
    }
    directories.push(bundled.to_path_buf());
    directories
}

/// Корень служебного хранилища базовых плагинов в рабочей директории проекта.
fn base_storage_root() -> PathBuf {
    crate::paths::dev_data_dir().join(BASE_PLUGINS_DIR_NAME)
}

/// Директории session-плагинов для перечня стора: пользовательская и ресурсные
/// каталоги.
///
/// Ресурсы рабочей копии идут раньше копии в каталоге сборки, чтобы перечень
/// совпадал с приоритетом загрузки плагинов (свежая сборка не перекрывается
/// устаревшей копией в `target`).
fn session_plugin_directories(bundled: &Path, user: &Path) -> Vec<PathBuf> {
    let mut directories = vec![user.to_path_buf()];
    let development = crate::paths::resources_dir().join(PLUGINS_DIR_NAME);
    if development != *bundled && development.is_dir() {
        directories.push(development);
    }
    directories.push(bundled.to_path_buf());
    directories
}
