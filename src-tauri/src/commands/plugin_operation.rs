//! Generic IPC-маршрутизация операций плагина.

use std::sync::Mutex;

use serde_json::Value;
use tauri::State;

use crate::library::Library;

/// Передача opaque-операции активному source-плагину.
#[tauri::command]
pub fn invoke_library_operation(
    state: State<'_, Mutex<Library>>,
    operation: String,
    payload: Value,
) -> Result<Value, String> {
    let mut library = state.lock().map_err(|error| error.to_string())?;
    let response = library
        .invoke_source_operation(&operation, payload)
        .map_err(|error| error.to_string())?;
    serde_json::from_str(&response).map_err(|error| error.to_string())
}
