//! Сведения о приложении для страницы «Информация».
//!
//! Ядро владеет фактическими расположениями служебных каталогов и кешей и
//! отдаёт их интерфейсу одним снимком: без этого непонятно, где лежат плагины,
//! состояние и кеш. Версия приложения приходит из собранного пакета, остальное
//! вычисляется здесь. Список один: пользователю не показывают техническое
//! деление плагинов на уровни («каркас», «приложение») и «виды» — плагины есть
//! плагины.

use std::path::Path;

use serde::Serialize;

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

/// Имя подкаталога состояния с файлами настроек плагинов.
const PLUGIN_STATE_DIR_NAME: &str = "base-plugins";
/// Имя каталога кеша скомпилированных плагинов.
const WASM_CACHE_DIR_NAME: &str = "wasm-cache";
/// Имя файла конфигурации кеша плагинов.
const WASM_CACHE_CONFIG_FILE_NAME: &str = "wasm-cache.toml";

impl AppInfo {
    /// Сборка сведений из версии пакета и корня состояния приложения.
    ///
    /// Пользователю показывается одно расположение — каталог состояния, где
    /// лежат настройки, плагины, кеш и данные интерфейса. Внутреннее деление и
    /// жаргон («каркас», «уровень приложения», «в поставке») наружу не выносятся.
    pub fn build(name: impl Into<String>, version: impl Into<String>, state_root: &Path) -> Self {
        let path_of = |path: &Path| path.to_string_lossy().into_owned();
        let paths = vec![AppPath {
            key: "app_state".to_string(),
            title: "Состояние приложения".to_string(),
            path: path_of(state_root),
            note: format!(
                "Настройки, плагины, кеш ({WASM_CACHE_CONFIG_FILE_NAME}, {WASM_CACHE_DIR_NAME}, {PLUGIN_STATE_DIR_NAME}) и данные интерфейса"
            ),
        }];
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
