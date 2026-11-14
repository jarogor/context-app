//! Сохранение реестра рабочих мест.

use std::sync::Mutex;

use serde_json::Value;
use tauri::State;

use crate::plugin::AppState;
use crate::workspace_state::{self, WorkspacesFile};
/// Сохранение реестра рабочих мест в служебный каталог приложения.
///
/// Команда асинхронная: запись файла идёт в фоновом потоке, а общий
/// `Mutex<AppState>` берётся только на мгновенное чтение корня состояния. Иначе
/// сериализация и запись большого реестра занимали главный поток, и интерфейс
/// подвисал на каждом сохранении.
#[tauri::command]
pub async fn save_workspaces(
    state: State<'_, Mutex<AppState>>,
    workspaces: WorkspacesFile,
) -> Result<Value, String> {
    let root = {
        let state = crate::commands::lock_state(state.inner())?;
        state.app_state_root().to_path_buf()
    };
    tauri::async_runtime::spawn_blocking(move || {
        workspace_state::save(&root, &workspaces).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())??;
    Ok(serde_json::json!({ "ok": true }))
}
