//! Generic IPC-маршрутизация операций базовых плагинов.

use std::sync::Mutex;

use serde_json::Value;
use tauri::State;

use crate::plugin::contract::CAPABILITY_SETTINGS;
use crate::plugin::AppState;

/// Передача opaque-операции базовому плагину, предоставляющему capability.
///
/// Готовность фоновой сборки базовых плагинов ожидается после освобождения
/// общего замка состояния: вызов WASM-плагина может быть тяжёлым и не должен
/// блокировать лёгкие команды.
#[tauri::command]
pub async fn invoke_base_plugin_operation(
    state: State<'_, Mutex<AppState>>,
    capability: String,
    operation: String,
    payload: Value,
) -> Result<Value, String> {
    // Дескриптор runtime под коротким общим замком; ожидание — вне него.
    let handle = {
        let mut state = crate::commands::lock_state(state.inner())?;
        state.app_host_handle()
    };
    let response = handle.with_ready(|host| {
        host.invoke_capability(&capability, &operation, payload)
            .map_err(|error| error.to_string())
    })??;

    // Стор мог изменить активность плагинов — обновляем набор сессии, а
    // изменение настроек могло затронуть порог логирования.
    let mut state = crate::commands::lock_state(state.inner())?;
    let disabled = state.disabled_plugins();
    state.session.set_disabled_plugins(disabled);
    if capability == CAPABILITY_SETTINGS {
        let _ = state.with_app_host(|host| host.refresh_log_level());
    }

    serde_json::from_str(&response).map_err(|error| error.to_string())
}
