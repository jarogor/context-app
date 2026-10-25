//! Список истории открытых библиотек для UI.

use std::sync::Mutex;

use serde_json::Value;
use tauri::State;

use crate::library_history;
use crate::plugin::AppState;

/// История, отфильтрованная по доступным source-плагинам.
///
/// Команда асинхронная: ждать общий `Mutex<AppState>`, который может быть занят
/// тяжёлой операцией базового плагина, нельзя на главном потоке — иначе
/// подвисает интерфейс.
#[tauri::command]
pub async fn library_history_list(state: State<'_, Mutex<AppState>>) -> Result<Value, String> {
    let providers = crate::commands::plugin_operation::with_session(state.inner(), |session| {
        session.available_source_plugins()
    })?;
    let (root, disabled) = {
        let state = crate::commands::lock_state(state.inner())?;
        (
            state.app_state_root().to_path_buf(),
            state.disabled_plugins(),
        )
    };
    let entries =
        library_history::list(&root, &providers, &disabled).map_err(|error| error.to_string())?;
    Ok(serde_json::json!({ "entries": entries }))
}
