//! Generic IPC-маршрутизация операций базовых плагинов.

use std::sync::Mutex;

use serde_json::Value;
use tauri::State;

use crate::plugin::contract::{CAPABILITY_PLUGIN_STORE, CAPABILITY_SETTINGS};
use crate::plugin::AppState;

/// Ключ порога логирования в значениях секции настроек приложения.
const LOG_LEVEL_KEY: &str = "diagnostics.log_level";

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
    // Признак смены порога логирования нужен после вызова, поэтому считается
    // заранее: payload уходит плагину по владению.
    let log_level_changed =
        capability == CAPABILITY_SETTINGS && payload_changes_log_level(&payload);
    let response = handle.with_ready(|host| {
        host.invoke_capability(&capability, &operation, payload)
            .map_err(|error| error.to_string())
    })??;

    // Стор мог изменить активность плагинов, а настройки — порог логирования.
    // Чтение активности и перезапрос уровня логирования ходят на диск и в WASM
    // под общим замком состояния, поэтому они нужны только там, где это
    // действительно могло измениться. Иначе каждое сохранение настроек (тема,
    // палитра, любое поле) задерживало закрытие раздела: замок занят, и
    // интерфейс не отвечает на следующий клик.
    let mut state = crate::commands::lock_state(state.inner())?;
    if capability_changes_activation(&capability, &operation) {
        let disabled = state.disabled_plugins();
        state.session.set_disabled_plugins(disabled);
    }
    if log_level_changed {
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

/// Меняет ли запрос настроек порог логирования.
///
/// Порог задаётся значением `diagnostics.log_level` и меняется только вместе с
/// ним. Сохранение темы, палитры или любого другого поля журнал не трогает,
/// поэтому перечитывать порог из WASM после каждой записи не нужно: это лишняя
/// работа под общим замком состояния, и она задерживала ответ интерфейса.
fn payload_changes_log_level(payload: &Value) -> bool {
    let mut values = Vec::new();
    if let Some(single) = payload.get("values") {
        values.push(single);
    }
    if let Some(sections) = payload.get("sections").and_then(Value::as_array) {
        for section in sections {
            if let Some(section_values) = section.get("values") {
                values.push(section_values);
            }
        }
    }
    values
        .into_iter()
        .any(|value| value.get(LOG_LEVEL_KEY).is_some())
}

#[cfg(test)]
#[path = "base_plugin_operation_tests.rs"]
mod tests;
