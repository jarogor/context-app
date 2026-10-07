//! Пути рабочей копии проекта.
//!
//! Единая точка вычисления корня проекта, служебного каталога разработки и
//! ресурсного каталога приложения — вместо повторяющихся `CARGO_MANIFEST_DIR`
//! в разных модулях.

use std::path::PathBuf;

/// Каталог крейта приложения (`src-tauri`).
pub fn manifest_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

/// Корень рабочей копии проекта (родитель каталога `src-tauri`).
pub fn project_root() -> PathBuf {
    manifest_dir()
        .parent()
        .expect("родитель папки src-tauri")
        .to_path_buf()
}

/// Каталог служебных данных разработки (`dev_data` в корне проекта).
pub fn dev_data_dir() -> PathBuf {
    project_root().join("dev_data")
}

/// Ресурсный каталог приложения (`src-tauri/resources`).
pub fn resources_dir() -> PathBuf {
    manifest_dir().join("resources")
}
