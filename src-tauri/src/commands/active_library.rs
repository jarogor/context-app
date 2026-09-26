//! Активная библиотека для интерфейса.

use std::sync::Mutex;

use serde_json::Value;
use tauri::State;

use crate::plugin::AppState;

/// Активная библиотека: путь, провайдер и его имя, либо `null`.
#[tauri::command]
pub fn active_library(state: State<'_, Mutex<AppState>>) -> Result<Value, String> {
    let state = state.lock().map_err(|error| error.to_string())?;
    match state.session.active_library() {
        Some((path, provider, provider_name)) => Ok(serde_json::json!({
            "path": path,
            "provider": provider,
            "provider_name": provider_name,
        })),
        None => Ok(Value::Null),
    }
}
