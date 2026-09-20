//! Пути служебного состояния plugin host.

use std::path::PathBuf;

use tauri::{AppHandle, Manager};

/// Получение корня служебных данных приложения.
pub(crate) fn app_state_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        return Ok(PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("dev_data")
            .join("app-state"));
    }

    app.path().app_data_dir().map_err(|error| error.to_string())
}
