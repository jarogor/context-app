//! Generic IPC-маршрутизация операций базовых плагинов.

use std::sync::Mutex;

use serde_json::Value;
use tauri::State;

use crate::plugin::contract::CAPABILITY_SETTINGS;
use crate::plugin::AppState;

/// Передача opaque-операции базовому плагину, предоставляющему capability.
///
/// Команда асинхронная: вызов WASM-плагина может быть тяжёлым (первое
/// обращение и инициализация) и не должен блокировать главный поток, иначе
/// подвисает интерфейс.
#[tauri::command]
pub async fn invoke_base_plugin_operation(
    state: State<'_, Mutex<AppState>>,
    capability: String,
    operation: String,
    payload: Value,
) -> Result<Value, String> {
    let mut state = crate::commands::lock_state(state.inner())?;
    let response = state
        .app_host()?
        .invoke_capability(&capability, &operation, payload)
        .map_err(|error| error.to_string())?;

    // Стор мог изменить активность плагинов — обновляем набор сессии.
    let disabled = state.disabled_plugins();
    state.session.set_disabled_plugins(disabled);

    // Изменение настроек могло затронуть порог логирования.
    if capability == CAPABILITY_SETTINGS {
        state.app_host()?.refresh_log_level();
    }

    serde_json::from_str(&response).map_err(|error| error.to_string())
}
