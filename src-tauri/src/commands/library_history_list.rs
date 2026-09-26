//! Список истории открытых библиотек для UI.

use std::sync::Mutex;

use serde_json::Value;
use tauri::State;

use crate::library_history;
use crate::plugin::AppState;

/// История, отфильтрованная по доступным source-плагинам.
#[tauri::command]
pub fn library_history_list(state: State<'_, Mutex<AppState>>) -> Result<Value, String> {
    let state = state.lock().map_err(|error| error.to_string())?;
    let providers = state.session.available_source_plugins();
    let disabled = crate::plugin::activation::load(state.app_state_root()).unwrap_or_default();
    let entries = library_history::list(state.app_state_root(), &providers, &disabled)
        .map_err(|error| error.to_string())?;
    Ok(serde_json::json!({ "entries": entries }))
}
