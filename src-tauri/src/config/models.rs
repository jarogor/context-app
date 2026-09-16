//! Модели файла конфигурации приложения.

use serde::Deserialize;

/// Сериализуемое содержимое `app-config.toml`.
#[derive(Deserialize)]
pub(super) struct FileConfig {
    /// Секция `[data]` файла конфигурации.
    pub data: DataConfig,
}

/// Секция `[data]` файла конфигурации.
#[derive(Deserialize)]
pub(super) struct DataConfig {
    /// Путь к библиотеке, если задан в файле.
    pub library_dir: Option<String>,
}
