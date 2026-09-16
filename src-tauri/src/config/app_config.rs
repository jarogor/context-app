//! Конфигурация приложения.

use std::path::{Path, PathBuf};

use super::models::FileConfig;

/// Конфигурация приложения.
#[derive(Debug)]
pub struct AppConfig {
    /// Путь к директории библиотеки.
    pub library_dir: PathBuf,
}

impl AppConfig {
    /// Загрузка конфигурации из окружения и файла.
    pub fn load() -> Result<Self, String> {
        let project_root = project_root();

        if let Ok(value) = std::env::var(crate::constants::LIBRARY_DIR_ENV) {
            return Ok(Self {
                library_dir: resolve(&project_root, Path::new(&value)),
            });
        }

        let config_path = project_root.join(crate::constants::CONFIG_FILE_NAME);
        if let Ok(contents) = std::fs::read_to_string(&config_path) {
            let parsed: FileConfig = toml::from_str(&contents).map_err(|e| e.to_string())?;
            if let Some(library_dir) = parsed.data.library_dir {
                return Ok(Self {
                    library_dir: resolve(&project_root, Path::new(&library_dir)),
                });
            }
        }

        Ok(Self {
            library_dir: resolve(
                &project_root,
                Path::new(crate::constants::DEFAULT_LIBRARY_DIR),
            ),
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
#[path = "_tests.rs"]
mod tests;
