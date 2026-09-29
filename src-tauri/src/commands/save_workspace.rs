//! Сохранение состояния рабочего места.

use std::sync::Mutex;

use tauri::State;

use crate::plugin::AppState;
use crate::workspace_state::{self, WorkspaceState};

/// Сохранение состояния рабочего места в служебном каталоге приложения.
#[tauri::command]
pub fn save_workspace(
    state: State<'_, Mutex<AppState>>,
    workspace: WorkspaceState,
) -> Result<(), String> {
    let state = state.lock().map_err(|error| error.to_string())?;
    workspace_state::save(state.app_state_root(), &workspace).map_err(|error| error.to_string())
}
