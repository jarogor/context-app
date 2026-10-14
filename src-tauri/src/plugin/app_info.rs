//! Сведения о приложении для страницы «Информация».
//!
//! Ядро владеет фактическими расположениями служебных каталогов и кешей и
//! отдаёт их интерфейсу одним снимком: без этого разработчику и пользователю
//! непонятно, где лежат конфиги, состояние и кеш, а путь зависит от сборки.
//! Версия приложения приходит от собранного пакета, остальное вычисляется здесь.

use std::path::Path;

use serde::Serialize;

use crate::constants::WEBVIEW_DIR_NAME;

/// Описание одного служебного расположения для отображения.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AppPath {
    /// Машинный ключ расположения.
    pub key: String,
    /// Человекочитаемое название.
    pub title: String,
    /// Абсолютный путь к каталогу или файлу.
    pub path: String,
    /// Краткое пояснение назначения.
    pub note: String,
}

/// Сведения о приложении: версия и служебные расположения.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AppInfo {
    /// Отображаемое название приложения.
    pub name: String,
    /// Версия приложения из пакета.
    pub version: String,
    /// Служебные каталоги и файлы состояния, конфигов и кешей.
    pub paths: Vec<AppPath>,
}

/// Имена служебных каталогов и файлов, публикуемые странице «Информация».
const BASE_PLUGINS_DIR_NAME: &str = "base-plugins";
const WASM_CACHE_DIR_NAME: &str = "wasm-cache";
const WASM_CACHE_CONFIG_FILE_NAME: &str = "wasm-cache.toml";

impl AppInfo {
    /// Сборка сведений из версии пакета и корневых каталогов.
    ///
    /// `state_root` — служебный каталог состояния приложения, он же база для
    /// состояния базовых плагинов и кеша WASM. Каталоги плагинов передаются
    /// явно: их расположение зависит от сборки (ресурсы рабочей копии или
    /// каталог данных приложения).
    pub fn build(
        name: impl Into<String>,
        version: impl Into<String>,
        state_root: &Path,
        user_plugins_root: &Path,
        bundled_plugins_root: &Path,
        bundled_base_plugins_root: &Path,
    ) -> Self {
        let path_of = |path: &Path| path.to_string_lossy().into_owned();
        let paths = vec![
            AppPath {
                key: "app_state".to_string(),
                title: "Служебное состояние приложения".to_string(),
                path: path_of(state_root),
                note: "Реестры приложения: рабочие места, история библиотек, активность плагинов"
                    .to_string(),
            },
            AppPath {
                key: "webview".to_string(),
                title: "Данные webview".to_string(),
                path: path_of(&state_root.join(WEBVIEW_DIR_NAME)),
                note: "Данные движка webview: кеш, локальное хранилище, cookies".to_string(),
            },
            AppPath {
                key: "base_plugins_state".to_string(),
                title: "Состояние базовых плагинов".to_string(),
                path: path_of(&state_root.join(BASE_PLUGINS_DIR_NAME)),
                note: "Один JSON-файл на базовый плагин: настройки, заметки, журнал".to_string(),
            },
            AppPath {
                key: "user_plugins".to_string(),
                title: "Пользовательские плагины".to_string(),
                path: path_of(user_plugins_root),
                note: "Плагины, установленные пользователем из файла".to_string(),
            },
            AppPath {
                key: "bundled_plugins".to_string(),
                title: "Поставляемые плагины".to_string(),
                path: path_of(bundled_plugins_root),
                note: "Плагины в поставке приложения: источники и рабочие места".to_string(),
            },
            AppPath {
                key: "bundled_base_plugins".to_string(),
                title: "Базовые плагины каркаса".to_string(),
                path: path_of(bundled_base_plugins_root),
                note: "Базовые плагины поставки: настройки, уведомления, стор, заметки".to_string(),
            },
            AppPath {
                key: "wasm_cache".to_string(),
                title: "Кэш компиляции WASM".to_string(),
                path: path_of(&state_root.join(WASM_CACHE_DIR_NAME)),
                note: format!(
                    "Скомпилированные модули плагинов; конфигурация — {WASM_CACHE_CONFIG_FILE_NAME}"
                ),
            },
        ];
        Self {
            name: name.into(),
            version: version.into(),
            paths,
        }
    }
}

#[cfg(test)]
#[path = "app_info_tests.rs"]
mod tests;
