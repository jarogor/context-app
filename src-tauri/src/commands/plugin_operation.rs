//! Generic IPC-маршрутизация операций plugin-а.

use std::sync::Mutex;

use serde_json::Value;
use tauri::State;

use crate::plugin::AppState;

/// Передача opaque-операции активному plugin-у.
///
/// Команда асинхронная: операции источника (сканирование, чтение, обложки)
/// могут быть тяжёлыми и не должны блокировать главный поток.
#[tauri::command]
pub async fn invoke_plugin_operation(
    state: State<'_, Mutex<AppState>>,
    plugin: Option<String>,
    root: Option<String>,
    writable: Option<bool>,
    storage_root: String,
    operation: String,
    payload: Value,
) -> Result<Value, String> {
    let mut state = crate::commands::lock_state(state.inner())?;

    if let Some(plugin) = plugin {
        let root = root.ok_or_else(|| "не указан root plugin".to_string())?;

        state
            .session
            .configure(root, plugin, writable.unwrap_or(false), storage_root)
            .map_err(|error| error.to_string())?;

        state.after_session_reload();
    }

    let response = state
        .session
        .invoke(&operation, payload)
        .map_err(|error| error.to_string())?;

    let _ = state.with_app_host(|host| host.drain_and_deliver());

    serde_json::from_str(&response).map_err(|error| error.to_string())
}
