//! Сведения о приложении для страницы «Информация».
//!
//! Ядро владеет фактическими расположениями служебных каталогов и кешей и
//! отдаёт их интерфейсу одним снимком: без этого разработчику и пользователю
//! непонятно, где лежат конфиги, состояние и кеш, а путь зависит от сборки.
//! Версия приложения приходит от собранного пакета, остальное вычисляется здесь.
//!
//! Расположения разделены по уровню: каркас (его плагины и кэш) не смешивается
//! с приложением (его состояние, плагины и данные движка), чтобы два уровня не
//! путались в одном списке.

use std::path::Path;

use serde::Serialize;

use crate::constants::WEBVIEW_DIR_NAME;

/// Уровень расположения в снимке: каркас или приложение.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AppPathLevel {
    /// Расположение каркаса: его служебные плагины и кэш.
    Framework,
    /// Расположение приложения: его состояние, плагины и данные движка.
    Application,
}

impl AppPathLevel {
    /// Строковое имя уровня (совпадает с сериализацией).
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Framework => "framework",
            Self::Application => "application",
        }
    }
}

/// Описание одного служебного расположения для отображения.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AppPath {
    /// Машинный ключ расположения.
    pub key: String,
    /// Уровень расположения: каркас или приложение.
    pub level: AppPathLevel,
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
    /// состояния плагинов уровня приложения и кеша WASM. Каталоги плагинов
    /// передаются явно: их расположение зависит от сборки (ресурсы рабочей
    /// копии или каталог данных приложения).
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
                key: "framework_plugins".to_string(),
                level: AppPathLevel::Framework,
                title: "Плагины каркаса в поставке".to_string(),
                path: path_of(bundled_base_plugins_root),
                note: "Служебные плагины каркаса: настройки, уведомления, стор".to_string(),
            },
            AppPath {
                key: "app_state".to_string(),
                level: AppPathLevel::Application,
                title: "Служебное состояние приложения".to_string(),
                path: path_of(state_root),
                note: "Реестры приложения: рабочие места, история библиотек, активность плагинов"
                    .to_string(),
            },
            AppPath {
                key: "app_plugins_state".to_string(),
                level: AppPathLevel::Application,
                title: "Состояние плагинов уровня приложения".to_string(),
                path: path_of(&state_root.join(BASE_PLUGINS_DIR_NAME)),
                note: "Один JSON-файл на плагин: настройки, журнал, заметки".to_string(),
            },
            AppPath {
                key: "application_plugins".to_string(),
                level: AppPathLevel::Application,
                title: "Плагины приложения в поставке".to_string(),
                path: path_of(bundled_plugins_root),
                note: "Плагины приложения в поставке: источники книг, форматы, заметки".to_string(),
            },
            AppPath {
                key: "user_plugins".to_string(),
                level: AppPathLevel::Application,
                title: "Пользовательские плагины".to_string(),
                path: path_of(user_plugins_root),
                note: "Плагины, установленные пользователем из файла".to_string(),
            },
            AppPath {
                key: "webview".to_string(),
                level: AppPathLevel::Application,
                title: "Данные webview".to_string(),
                path: path_of(&state_root.join(WEBVIEW_DIR_NAME)),
                note: "Данные движка webview: кеш, локальное хранилище, cookies".to_string(),
            },
            AppPath {
                key: "wasm_cache".to_string(),
                level: AppPathLevel::Framework,
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
