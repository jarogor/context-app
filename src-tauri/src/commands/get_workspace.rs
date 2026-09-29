//! Состояние рабочего места для интерфейса.

use std::sync::Mutex;

use tauri::State;

use crate::plugin::AppState;
use crate::workspace_state::{self, WorkspaceState};

/// Состояние рабочего места из служебного каталога приложения.
#[tauri::command]
pub fn get_workspace(state: State<'_, Mutex<AppState>>) -> Result<WorkspaceState, String> {
    let state = state.lock().map_err(|error| error.to_string())?;
    workspace_state::load(state.app_state_root()).map_err(|error| error.to_string())
}
