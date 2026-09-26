//! Удаление записи истории открытых библиотек.

use std::sync::Mutex;

use serde_json::Value;
use tauri::State;

use crate::library_history;
use crate::plugin::AppState;

/// Удаление записи истории по пути библиотеки.
#[tauri::command]
pub fn library_history_forget(
    state: State<'_, Mutex<AppState>>,
    path: String,
) -> Result<Value, String> {
    let state = state.lock().map_err(|error| error.to_string())?;
    library_history::forget(state.app_state_root(), &path).map_err(|error| error.to_string())?;
    Ok(serde_json::json!({ "forgotten": path }))
}
