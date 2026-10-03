//! Сведения о приложении для страницы «Информация».

use std::sync::Mutex;

use tauri::State;

use crate::plugin::{AppInfo, AppState};

/// Версия приложения из манифеста пакета.
#[tauri::command]
pub fn app_info(state: State<'_, Mutex<AppState>>) -> Result<AppInfo, String> {
    let state = state.lock().map_err(|error| error.to_string())?;
    Ok(state.app_info())
}
