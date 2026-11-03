#[cfg(test)]
pub mod test_util;

pub mod atomic_file;
pub mod commands;
pub mod constants;
pub mod library_history;
pub mod paths;
pub mod plugin;
pub mod reader_cache;
pub mod startup;
pub mod update;
pub mod workspace_state;

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::Manager;

use crate::constants::{
    resolve_app_data_root, resolve_app_state_root, resolve_user_plugins_root, resolve_webview_root,
    APP_DISPLAY_NAME, BASE_PLUGINS_DIR_NAME, PLUGINS_DIR_NAME,
};

use crate::plugin::{AppHostConfig, AppInfo, AppState, PluginSession, ReaderConfig};

/// Точка входа Tauri-приложения и generic plugin host.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    crate::startup::mark_start();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            plugin::relay::set_app_handle(app.handle().clone());
            crate::startup::mark("setup:начало");

            let resource_dir = app.path().resource_dir()?;
            let app_data_dir = app.path().app_data_dir().ok();
            let user_plugins_dir = resolve_user_plugins_root(app_data_dir.as_deref());
            let app_state_root = resolve_app_state_root(app_data_dir.as_deref());
            // Журнал диагностики пишется в файл рядом с состоянием: по нему
            // поддержка разбирает сбой, а пользователь отдаёт отчёт одним файлом.
            crate::plugin::diagnostics::init(&app_state_root);
            let app_data_root = resolve_app_data_root(app_data_dir.as_deref());

            let bundled_plugins_dir = resource_dir.join(PLUGINS_DIR_NAME);
            let bundled_base = resource_dir.join(BASE_PLUGINS_DIR_NAME);
            let wasm_cache = crate::plugin::wasm_cache::prepare(&app_state_root);

            // Данные движка webview (кеш, локальное хранилище, cookies) живут
            // в подкаталоге каталога состояния: движок задаёт свои имена сам,
            // и без явного каталога он разбросал бы их в корне каталога данных
            // рядом с нашими служебными именами. Каталог создаётся заранее, до
            // создания окна.
            let webview_root = resolve_webview_root(&app_state_root);
            std::fs::create_dir_all(&webview_root).ok();

            // Тяжёлая загрузка и компиляция WASM базовых плагинов намеренно НЕ
            // выполняется синхронно здесь: иначе окно остаётся белым, пока
            // компилятор плагинов работает. Сборка runtime запускается в фоне
            // сразу после конструирования состояния, параллельно загрузке окна.
            //
            // В app-level runtime грузятся плагины области приложения: каркасные
            // (настройки, стор) и прикладные, нужные до открытия
            // библиотеки (заметки). Поэтому директории включают и каталог
            // плагинов приложения.
            let app_host_config = AppHostConfig {
                directories: application_scope_directories(
                    &bundled_base,
                    &bundled_plugins_dir,
                    &user_plugins_dir,
                ),
                storage_root: base_storage_root(&app_state_root),
                user_plugins_dir: user_plugins_dir.clone(),
                activation_root: app_state_root.clone(),
                catalog_dirs: session_plugin_directories(&bundled_plugins_dir, &user_plugins_dir),
                cache: wasm_cache.clone(),
            };

            // Прогрев плагинов чтения идёт в фоне: первое открытие библиотеки
            // не должно ждать компиляции WASM.
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
                &app_data_root,
            );

            app.manage(Mutex::new(AppState::new(
                host,
                app_state_root,
                app_info,
                reader_config.clone(),
                app_host_config,
            )));

            // Runtime чтения и базовые плагины компилируются в фоне, параллельно
            // с загрузкой окна: первый кадр не ждёт компилятор плагинов. Один
            // прогрев на набор — команды чтения разделяют тот же runtime.
            let state = app.state::<Mutex<AppState>>();
            {
                let mut state = crate::commands::lock_state(state.inner())?;
                let reader = crate::plugin::warmup::spawn_reader_warmup(reader_config);
                state.set_reader_runtime(reader);
                let _ = state.spawn_app_host();
            }
            crate::startup::mark("setup:готово (фоновые сборки запущены)");

            // Главное окно создаётся кодом, а не конфигом: только так можно
            // задать абсолютный каталог данных webview, не привязываясь к
            // относительному пути в конфиге. Окно создаётся скрытым: его
            // показывает интерфейс после первой отрисовки. Страховка на случай,
            // если интерфейс не загрузился.
            let window = tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App("index.html".into()),
            )
            .title(APP_DISPLAY_NAME)
            .inner_size(1100.0, 750.0)
            .visible(false)
            .data_directory(webview_root)
            .build()?;
            crate::commands::show_window::schedule_fallback_show(window);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::invoke_plugin_operation,
            commands::invoke_base_plugin_operation,
            commands::app_log,
            commands::app_info,
            commands::app_name_set,
            commands::diagnostics_open_folder,
            commands::open_folder,
            commands::support_report,
            commands::support_report_save,
            commands::select_source_library,
            commands::active_library,
            commands::library_history_list,
            commands::library_history_forget,
            commands::get_workspaces,
            commands::save_workspaces,
            commands::plugin_activation_pending,
            commands::theme_preference,
            commands::theme_palette,
            commands::interface_locale,
            commands::app_title_set,
            commands::reader_theme,
            commands::reader_font,
            commands::reader_open_link,
            commands::window_open_tabs_limit,
            commands::show_window,
            commands::reader_formats,
            commands::reader_plugin_for_format,
            commands::reader_viewer,
            commands::reader_viewer_files,
            commands::reader_viewer_file,
            commands::reader_content,
            commands::reader_cover,
            commands::workspace_covers,
            commands::reader_open_external,
            commands::reader_book_chunk,
            commands::reader_cache_load,
            commands::reader_cache_save,
            commands::reader_cache_forget,
            commands::reader_forget_book,
            commands::update_status,
            commands::update_source_set,
            commands::update_source_clear,
            commands::update_check_on_startup_set,
            commands::update_check,
            commands::update_apply,
            commands::update_skip,
            commands::update_restart,
            commands::update_quit,
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

/// Директории плагинов области приложения в порядке приоритета.
///
/// Область приложения включает плагины каркаса (настройки, стор) и
/// прикладные плагины, нужные до открытия библиотеки (заметки). Директории
/// собираются так же, как для прочих плагинов: ресурсы рабочей копии раньше
/// копии в каталоге сборки, пользовательский каталог — впереди поставляемых.
/// Фильтрация по области выполняется при загрузке runtime.
fn application_scope_directories(
    bundled_base: &Path,
    bundled_plugins: &Path,
    user_plugins: &Path,
) -> Vec<PathBuf> {
    let mut directories = base_plugin_directories(bundled_base);
    directories.extend(session_plugin_directories(bundled_plugins, user_plugins));
    directories
}

/// Корень служебного хранилища базовых плагинов внутри каталога состояния.
///
/// Состояние базовых плагинов (настройки, заметки, журнал) принадлежит
/// приложению и живёт в каталоге состояния (`app-state/base-plugins`), а не в
/// каталоге разработки: так оно следует развилке сборки dev/release вместе с
/// прочим служебным состоянием и не читается release-сборкой из рабочей копии.
fn base_storage_root(app_state_root: &Path) -> PathBuf {
    app_state_root.join(BASE_PLUGINS_DIR_NAME)
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

#[cfg(test)]
#[path = "lib_tests.rs"]
mod tests;
