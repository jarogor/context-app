//! Generic IPC-маршрутизация операций plugin-а.

use std::sync::Mutex;

use serde_json::Value;
use tauri::State;

use crate::plugin::PluginSession;

/// Передача opaque-операции активному plugin-у.
#[tauri::command]
pub fn invoke_plugin_operation(
    state: State<'_, Mutex<PluginSession>>,
    plugin: Option<String>,
    root: Option<String>,
    writable: Option<bool>,
    storage_root: Option<String>,
    operation: String,
    payload: Value,
) -> Result<Value, String> {
    let mut host = state.lock().map_err(|error| error.to_string())?;
    if let Some(plugin) = plugin {
        let root = root.ok_or_else(|| "не указан root plugin".to_string())?;
        host.configure(root, plugin, writable.unwrap_or(false), storage_root)
            .map_err(|error| error.to_string())?;
    }
    let response = host
        .invoke(&operation, payload)
        .map_err(|error| error.to_string())?;
    serde_json::from_str(&response).map_err(|error| error.to_string())
}
