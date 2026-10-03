//! Сохранение реестра рабочих мест.

use std::sync::Mutex;

use serde_json::Value;
use tauri::State;

use crate::plugin::AppState;
use crate::workspace_state::{self, WorkspacesFile};

/// Сохранение реестра рабочих мест в служебный каталог приложения.
///
/// Команда асинхронная: ждать общий `Mutex<AppState>`, который может быть занят
/// тяжёлой операцией базового плагина, нельзя на главном потоке — иначе
/// подвисает интерфейс.
#[tauri::command]
pub async fn save_workspaces(
    state: State<'_, Mutex<AppState>>,
    workspaces: WorkspacesFile,
) -> Result<Value, String> {
    let state = state.lock().map_err(|error| error.to_string())?;
    workspace_state::save(state.app_state_root(), &workspaces)
        .map_err(|error| error.to_string())?;
    Ok(serde_json::json!({ "ok": true }))
}
