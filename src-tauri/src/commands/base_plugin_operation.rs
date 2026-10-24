//! Generic IPC-маршрутизация операций базовых плагинов.

use std::sync::Mutex;

use serde_json::Value;
use tauri::State;

use crate::plugin::contract::{CAPABILITY_PLUGIN_STORE, CAPABILITY_SETTINGS};
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

    // Стор мог изменить активность плагинов, а настройки — порог логирования.
    // Чтение активности и перезапрос уровня логирования ходят на диск и в WASM,
    // поэтому они нужны только там, где это действительно могло измениться.
    // Сохранение настроек отклик интерфейса задерживало, хотя активность и
    // журнал от него не зависят.
    let mut state = crate::commands::lock_state(state.inner())?;
    if capability_changes_activation(&capability, &operation) {
        let disabled = state.disabled_plugins();
        state.session.set_disabled_plugins(disabled);
    }
    if capability == CAPABILITY_SETTINGS && operation_changes_log_level(&operation) {
        let _ = state.with_app_host(|host| host.refresh_log_level());
    }

    serde_json::from_str(&response).map_err(|error| error.to_string())
}

/// Меняет ли операция набор активности плагинов.
///
/// Активность меняет только стор плагинов: остальные операции её не касаются,
/// поэтому перечитывать реестр отключённых с диска после них не нужно.
fn capability_changes_activation(capability: &str, operation: &str) -> bool {
    capability == CAPABILITY_PLUGIN_STORE && operation == "set_enabled"
}

/// Меняет ли операция настроек порог логирования.
///
/// Порог задаётся значением `diagnostics.log_level` и меняется только вместе с
/// ним: чтение и сохранение прочих значений журнал не трогают.
fn operation_changes_log_level(operation: &str) -> bool {
    matches!(operation, "set" | "save")
}

#[cfg(test)]
#[path = "base_plugin_operation_tests.rs"]
mod tests;
