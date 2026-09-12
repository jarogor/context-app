//! Модели файла конфигурации приложения.

use serde::Deserialize;

/// Сериализуемое содержимое `app-config.toml`.
#[derive(Deserialize)]
pub(super) struct FileConfig {
    pub data: DataConfig,
}

#[derive(Deserialize)]
pub(super) struct DataConfig {
    pub library_dir: Option<String>,
}
