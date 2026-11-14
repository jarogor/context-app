//! Generic IPC-маршрутизация операций базовых плагинов.

use std::sync::Mutex;

use serde_json::Value;
use tauri::State;

use crate::plugin::contract::CAPABILITY_PLUGIN_STORE;
use crate::plugin::AppState;

/// Передача opaque-операции базовому плагину, предоставляющему capability.
///
/// Готовность фоновой сборки базовых плагинов ожидается после освобождения
/// общего замка состояния: вызов WASM-плагина может быть тяжёлым и не должен
/// блокировать лёгкие команды.
///
/// Сам вызов идёт в пуле блокирующих задач: это синхронная работа с WASM,
/// которая занимала поток асинхронного рантайма. Из-за этого очередь команд
/// росла: сохранение настроек ждало, а нажатия приходили с задержкой и
/// «срабатывали» после того, как отпускали кнопку.
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
    let (capability_key, operation_key) = (capability.clone(), operation.clone());
    let response = tauri::async_runtime::spawn_blocking(move || {
        handle.with_ready(|host| {
            host.invoke_capability(&capability, &operation, payload)
                .map_err(|error| error.to_string())
        })
    })
    .await
    .map_err(|error| error.to_string())???;

    // Стор мог изменить активность плагинов. Чтение активности ходит на диск
    // под общим замком состояния, поэтому оно нужно только там, где это
    // действительно могло измениться. Иначе каждое сохранение настроек (тема,
    // палитра, любое поле) задерживало закрытие раздела: замок занят, и
    // интерфейс не отвечает на следующий клик.
    if capability_changes_activation(&capability_key, &operation_key) {
        let (disabled, session) = {
            let state = crate::commands::lock_state(state.inner())?;
            (state.disabled_plugins(), state.session.clone())
        };
        let locked = session.lock();
        if let Ok(mut guard) = locked {
            guard.set_disabled_plugins(disabled);
        }
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

#[cfg(test)]
#[path = "base_plugin_operation_tests.rs"]
mod tests;
