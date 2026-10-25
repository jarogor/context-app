//! Активная библиотека для интерфейса.

use std::sync::Mutex;

use serde_json::Value;
use tauri::State;

use crate::plugin::AppState;

/// Активная библиотека: путь, провайдер и его имя, либо `null`.
///
/// Команда асинхронная: ждать общий `Mutex<AppState>`, который может быть занят
/// тяжёлой операцией базового плагина, нельзя на главном потоке — иначе
/// подвисает интерфейс.
#[tauri::command]
pub async fn active_library(state: State<'_, Mutex<AppState>>) -> Result<Value, String> {
    let active = crate::commands::plugin_operation::with_session(state.inner(), |session| {
        session.active_library()
    })?;
    match active {
        Some((path, provider, provider_name)) => Ok(serde_json::json!({
            "path": path,
            "provider": provider,
            "provider_name": provider_name,
        })),
        None => Ok(Value::Null),
    }
}
