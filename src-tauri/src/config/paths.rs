//! Пути служебного состояния plugin host.

use std::path::PathBuf;

use tauri::{AppHandle, Manager};

/// Получение корня служебных данных приложения.
pub(crate) fn app_state_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        return Ok(project_root().join("dev_data").join("app-state"));
    }

    app.path().app_data_dir().map_err(|error| error.to_string())
}

/// Получение корня проекта.
fn project_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("родитель папки src-tauri")
        .to_path_buf()
}
