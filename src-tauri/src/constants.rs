//! Общие константы приложения.
//!
//! Централизованные имена файлов, папок и настроек приложения.

use std::path::{Path, PathBuf};

/// Имя папки с плагинами.
pub const PLUGINS_DIR_NAME: &str = "plugins";

/// Отображаемое название приложения.
pub const APP_DISPLAY_NAME: &str = "Текстура";

/// Имя папки с базовыми плагинами каркаса приложения.
pub const BASE_PLUGINS_DIR_NAME: &str = "base-plugins";

/// Имя пользовательского каталога плагинов приложения.
pub const USER_PLUGINS_DIR_NAME: &str = "app-plugins";

/// Имя каталога служебного состояния приложения.
pub const APP_STATE_DIR_NAME: &str = "app-state";

/// Имя подкаталога данных движка webview внутри каталога состояния.
///
/// Здесь живёт раскладка движка (кеш, локальное хранилище, cookies, HSTS,
/// ключи медиа), имена которой задаёт не приложение.
pub const WEBVIEW_DIR_NAME: &str = "webview";

/// Разрешение корня служебного состояния приложения.
///
/// В debug-сборке каталог живёт в `dev_data/app-state`; в release — в каталоге
/// данных приложения.
#[cfg(debug_assertions)]
pub fn resolve_app_state_root(_app_data_dir: Option<&Path>) -> PathBuf {
    crate::paths::dev_data_dir().join(APP_STATE_DIR_NAME)
}

/// Разрешение корня служебного состояния приложения в release.
#[cfg(not(debug_assertions))]
pub fn resolve_app_state_root(app_data_dir: Option<&Path>) -> PathBuf {
    app_data_dir
        .map(|dir| dir.join(APP_STATE_DIR_NAME))
        .unwrap_or_else(|| PathBuf::from(APP_STATE_DIR_NAME))
}

/// Разрешение корня пользовательского каталога плагинов приложения.
///
/// В debug-сборке каталог живёт в `dev_data/app-plugins` рабочей директории
/// проекта; в release — в каталоге данных приложения. Каталог общий для всех
/// библиотек.
#[cfg(debug_assertions)]
pub fn resolve_user_plugins_root(_app_data_dir: Option<&Path>) -> PathBuf {
    crate::paths::dev_data_dir().join(USER_PLUGINS_DIR_NAME)
}

/// Разрешение корня пользовательского каталога плагинов приложения в release.
#[cfg(not(debug_assertions))]
pub fn resolve_user_plugins_root(app_data_dir: Option<&Path>) -> PathBuf {
    app_data_dir
        .map(|dir| dir.join(USER_PLUGINS_DIR_NAME))
        .unwrap_or_else(|| PathBuf::from(USER_PLUGINS_DIR_NAME))
}

/// Разрешение корня данных движка webview.
///
/// Каталог лежит внутри каталога служебного состояния (`app-state/webview`),
/// поэтому следует развилке сборки dev/release вместе с прочим служебным
/// состоянием: в разработке — `dev_data/app-state/webview`, в выпуске — каталог
/// состояния в каталоге данных приложения.
pub fn resolve_webview_root(app_state_root: &Path) -> PathBuf {
    app_state_root.join(WEBVIEW_DIR_NAME)
}

#[cfg(test)]
#[path = "constants_tests.rs"]
mod tests;
