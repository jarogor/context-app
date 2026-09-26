//! Generic IPC-маршрутизация операций базовых плагинов.

use std::sync::Mutex;

use serde_json::Value;
use tauri::State;

use crate::plugin::contract::CAPABILITY_SETTINGS;
use crate::plugin::AppState;

/// Передача opaque-операции базовому плагину, предоставляющему capability.
#[tauri::command]
pub fn invoke_base_plugin_operation(
    state: State<'_, Mutex<AppState>>,
    capability: String,
    operation: String,
    payload: Value,
) -> Result<Value, String> {
    let mut state = state.lock().map_err(|error| error.to_string())?;
    let response = state
        .app_host
        .invoke_capability(&capability, &operation, payload)
        .map_err(|error| error.to_string())?;

    // Стор мог изменить активность плагинов — обновляем набор сессии.
    let disabled = crate::plugin::activation::load(&state.app_state_root).unwrap_or_default();
    state.session.set_disabled_plugins(disabled);

    // Изменение настроек могло затронуть порог логирования.
    if capability == CAPABILITY_SETTINGS {
        state.app_host.refresh_log_level();
    }

    serde_json::from_str(&response).map_err(|error| error.to_string())
}
