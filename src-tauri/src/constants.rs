//! Общие константы приложения.
//!
//! Централизованные имена файлов, папок и переменных окружения, используемые
//! настройкой, библиотекой и запуском приложения. Доменные контрактные
//! константы (схема БД, контракт плагинов) остаются в своих модулях.

use std::path::PathBuf;

use tauri::Manager;

/// Имя demo-плагина — runtime-имя из манифеста, по которому он вызывается.
pub const DEMO_PLUGIN_NAME: &str = "demo";

/// Имя папки source-плагина библиотеки, поставляемого с приложением.
pub const LIBRARY_PLUGIN_DIR: &str = "library";

/// Имя файла конфигурации приложения.
pub const CONFIG_FILE_NAME: &str = "app-config.toml";

/// Путь к библиотеке по умолчанию (относительно корня проекта).
pub const DEFAULT_LIBRARY_DIR: &str = "dev_data/library";

/// Переменная окружения, переопределяющая путь к библиотеке.
pub const LIBRARY_DIR_ENV: &str = "BOOKLIB_LIBRARY_DIR";

/// Имя файла SQLite-базы внутри портируемой директории.
pub const DATABASE_FILE_NAME: &str = "library.db";

/// Имя папки с файлами книг.
pub const BOOKS_DIR_NAME: &str = "books";

/// Имя папки с обложками.
pub const COVERS_DIR_NAME: &str = "covers";

/// Имя папки с плагинами.
pub const PLUGINS_DIR_NAME: &str = "plugins";

/// Путь к поставляемой папке плагинов приложения.
///
/// В разработке это `src-tauri/resources/plugins`; поставляемые плагины
/// читаются отсюда напрямую, чтобы внешняя библиотека не требовала записи.
pub fn bundled_plugins_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("plugins")
}

/// Разрешение пути к bundled-плагинам: релизный (через resource_dir) или dev (путь из CARGO_MANIFEST_DIR).
/// В тестах без AppHandle возвращается dev-путь.
pub(crate) fn bundled_plugins_dir_app(app: Option<&tauri::AppHandle>) -> Option<PathBuf> {
    if cfg!(debug_assertions) {
        return Some(bundled_plugins_dir());
    }

    if let Some(app) = app {
        Some(app.path().resource_dir().ok()?.join("plugins"))
    } else {
        Some(bundled_plugins_dir())
    }
}
