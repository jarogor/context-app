//! Generic IPC-маршрутизация операций source-плагина.

use std::sync::Mutex;

use serde_json::Value;
use tauri::State;

use crate::plugin::PluginHostSession;

/// Передача opaque-операции активному source-плагину.
#[tauri::command]
pub fn invoke_plugin_operation(
    state: State<'_, Mutex<PluginHostSession>>,
    operation: String,
    payload: Value,
) -> Result<Value, String> {
    let mut host = state.lock().map_err(|error| error.to_string())?;
    let response = host
        .invoke(&operation, payload)
        .map_err(|error| error.to_string())?;
    serde_json::from_str(&response).map_err(|error| error.to_string())
}
