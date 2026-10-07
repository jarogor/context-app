//! Удаление записи истории открытых библиотек.

use std::sync::Mutex;

use serde_json::Value;
use tauri::State;

use crate::library_history;
use crate::plugin::AppState;

/// Удаление записи истории по пути библиотеки.
///
/// Команда асинхронная: ждать общий `Mutex<AppState>`, который может быть занят
/// тяжёлой операцией базового плагина, нельзя на главном потоке — иначе
/// подвисает интерфейс.
#[tauri::command]
pub async fn library_history_forget(
    state: State<'_, Mutex<AppState>>,
    path: String,
) -> Result<Value, String> {
    let state = crate::commands::lock_state(state.inner())?;
    library_history::forget(state.app_state_root(), &path).map_err(|error| error.to_string())?;
    Ok(serde_json::json!({ "forgotten": path }))
}
