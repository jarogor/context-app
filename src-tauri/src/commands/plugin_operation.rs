//! Generic IPC-маршрутизация операций plugin-а.

use std::sync::Mutex;

use serde_json::Value;
use tauri::State;

use crate::plugin::{AppState, PluginSession};

/// Передача opaque-операции активному plugin-у.
///
/// Команда асинхронная и держит общий замок состояния только на получение
/// сессии: операции источника (сканирование, чтение, обложки) могут занимать
/// секунды, и держать на это время общий замок нельзя — иначе весь интерфейс
/// (настройки, шапка, уведомления) ждёт окончания сканирования книг.
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
    // Дескриптор сессии под коротким общим замком; сама работа — под замком
    // сессии, который не мешает остальным командам.
    let session = {
        let state = crate::commands::lock_state(state.inner())?;
        state.session.clone()
    };

    let mut session = session
        .lock()
        .map_err(|_| "сессия плагинов недоступна".to_string())?;

    let reloaded = if let Some(plugin) = plugin {
        let root = root.ok_or_else(|| "не указан root plugin".to_string())?;
        session
            .configure(root, plugin, writable.unwrap_or(false), storage_root)
            .map_err(|error| error.to_string())?;
        true
    } else {
        false
    };

    let response = session
        .invoke(&operation, payload)
        .map_err(|error| error.to_string())?;
    drop(session);

    let mut state = crate::commands::lock_state(state.inner())?;
    if reloaded {
        state.after_session_reload();
    }
    let _ = state.with_app_host(|host| host.drain_and_deliver());

    serde_json::from_str(&response).map_err(|error| error.to_string())
}

/// Выполнение действия над сессией под её замком.
///
/// Общий замок состояния берётся только на получение сессии: сама операция
/// источника книг может идти долго и не должна блокировать остальной интерфейс.
pub(crate) fn with_session<T>(
    state: &Mutex<AppState>,
    action: impl FnOnce(&mut PluginSession) -> T,
) -> Result<T, String> {
    let session = {
        let state = crate::commands::lock_state(state)?;
        state.session.clone()
    };
    let mut session = session
        .lock()
        .map_err(|_| "сессия плагинов недоступна".to_string())?;
    Ok(action(&mut session))
}

#[cfg(test)]
#[path = "plugin_operation_tests.rs"]
mod tests;
