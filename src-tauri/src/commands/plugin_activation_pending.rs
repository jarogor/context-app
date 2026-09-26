//! Признак неприменённых изменений активности плагинов.

use std::sync::Mutex;

use serde_json::Value;
use tauri::State;

use crate::plugin::AppState;

/// Есть ли изменения активности, требующие переоткрытия библиотеки или перезапуска.
#[tauri::command]
pub fn plugin_activation_pending(state: State<'_, Mutex<AppState>>) -> Result<Value, String> {
    let state = state.lock().map_err(|error| error.to_string())?;
    Ok(serde_json::json!({ "pending": state.session.activation_pending() }))
}
