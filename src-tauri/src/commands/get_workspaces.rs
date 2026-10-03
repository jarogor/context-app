//! Реестр рабочих мест для интерфейса.

use std::sync::Mutex;

use tauri::State;

use crate::plugin::AppState;
use crate::workspace_state::{self, WorkspacesFile};

/// Реестр рабочих мест из служебного каталога приложения.
///
/// Команда асинхронная: ждать общий `Mutex<AppState>`, который может быть занят
/// тяжёлой операцией базового плагина, нельзя на главном потоке — иначе
/// подвисает интерфейс.
#[tauri::command]
pub async fn get_workspaces(state: State<'_, Mutex<AppState>>) -> Result<WorkspacesFile, String> {
    let state = state.lock().map_err(|error| error.to_string())?;
    workspace_state::load(state.app_state_root()).map_err(|error| error.to_string())
}
