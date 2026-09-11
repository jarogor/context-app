//! Конфигурация приложения.
//!
//! Определяет, где приложение хранит данные (библиотеку). Для разработки
//! значения настроены так, чтобы всё хранилось внутри рабочей директории.
//! Источники конфигурации в порядке приоритета:
//!
//! 1. Переменная окружения `BOOKLIB_LIBRARY_DIR`;
//! 2. Файл `app-config.toml` (в `src-tauri/`), ключ `[data].library_dir`;
//! 3. Значение по умолчанию — `dev_data/library` внутри проекта.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;

const CONFIG_FILE_NAME: &str = "app-config.toml";
const DEFAULT_LIBRARY_DIR: &str = "dev_data/library";
const LIBRARY_DIR_ENV: &str = "BOOKLIB_LIBRARY_DIR";

/// Сериализуемое содержимое `app-config.toml`.
#[derive(Deserialize)]
struct FileConfig {
    data: DataConfig,
}

#[derive(Deserialize)]
struct DataConfig {
    library_dir: Option<String>,
}

/// Конфигурация приложения.
#[derive(Debug)]
pub struct AppConfig {
    pub library_dir: PathBuf,
}

impl AppConfig {
    /// Загрузка конфигурации из окружения и файла.
    pub fn load() -> Result<Self, String> {
        let project_root = project_root();

        if let Ok(value) = std::env::var(LIBRARY_DIR_ENV) {
            return Ok(Self {
                library_dir: resolve(&project_root, Path::new(&value)),
            });
        }

        let config_path = project_root.join(CONFIG_FILE_NAME);
        if let Ok(contents) = fs::read_to_string(&config_path) {
            let parsed: FileConfig = toml::from_str(&contents).map_err(|e| e.to_string())?;
            if let Some(library_dir) = parsed.data.library_dir {
                return Ok(Self {
                    library_dir: resolve(&project_root, Path::new(&library_dir)),
                });
            }
        }

        Ok(Self {
            library_dir: resolve(&project_root, Path::new(DEFAULT_LIBRARY_DIR)),
        })
    }
}

/// Корень проекта (родитель папки `src-tauri/`) для разрешения путей.
fn project_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("родитель папки src-tauri")
        .to_path_buf()
}

/// Разрешение пути относительно корня проекта, если путь относительный.
fn resolve(root: &Path, path: &Path) -> PathBuf {
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        root.join(path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_util;

    #[test]
    fn default_library_dir_is_inside_project() {
        let config = AppConfig::load().expect("загрузка конфигурации");
        let project_root = project_root();
        assert!(
            config.library_dir.starts_with(&project_root),
            "путь библиотеки внутри рабочей директории"
        );
    }

    #[test]
    fn env_variable_overrides_library_dir() {
        let temp = test_util::test_root("config-env");
        std::env::set_var(LIBRARY_DIR_ENV, temp.as_os_str());
        let config = AppConfig::load().expect("загрузка конфигурации с окружением");
        std::env::remove_var(LIBRARY_DIR_ENV);
        assert_eq!(config.library_dir, temp, "путь из переменной окружения");
        test_util::cleanup(&temp);
    }
}
