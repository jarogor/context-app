//! Сведения о приложении для страницы «Обновления».
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

impl AppInfo {
    /// Сборка сведений из версии пакета и корня данных приложения.
    ///
    /// Пользователю показываются два файла: каталог данных с настройками и
    /// плагинами и журнал, который отдаётся при обращении. Внутреннее деление и
    /// жаргон («каркас», «уровень приложения», «в поставке») наружу не выносятся.
    pub fn build(name: impl Into<String>, version: impl Into<String>, data_root: &Path) -> Self {
        let path_of = |path: &Path| path.to_string_lossy().into_owned();
        let paths = vec![
            AppPath {
                key: "app_data".to_string(),
                title: "app.settings.data.title".to_string(),
                path: path_of(data_root),
                note: "app.settings.data.note".to_string(),
            },
            // Журнал — единственный файл, который пользователю нужно найти
            // самому, чтобы отдать при обращении.
            AppPath {
                key: "diagnostics".to_string(),
                title: "app.settings.logs.title".to_string(),
                path: path_of(
                    &data_root
                        .join(crate::constants::APP_STATE_DIR_NAME)
                        .join(crate::plugin::diagnostics::DIAGNOSTICS_FILE_NAME),
                ),
                note: String::new(),
            },
        ];
        Self {
            name: name.into(),
            version: version.into(),
            paths,
        }
    }

    /// Смена имени приложения на выбранный язык интерфейса.
    ///
    /// Имя — текст интерфейса: в русском «Контекст», в английском «Context».
    /// Ядро перевода не хранит, а принимает готовое имя от оболочки, которая
    /// знает активный язык; служебные расположения при этом не меняются.
    pub fn set_name(&mut self, name: impl Into<String>) {
        self.name = name.into();
    }
}

#[cfg(test)]
#[path = "app_info_tests.rs"]
mod tests;
