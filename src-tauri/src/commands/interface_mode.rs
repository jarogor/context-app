//! Выбор режима интерфейса из настроек приложения.

use std::sync::Mutex;

use tauri::State;

use crate::plugin::AppState;

/// Выбор режима интерфейса: `auto`, `tablet` или `desktop`.
///
/// `auto` означает «следовать ширине окна»; остальные значения задают режим
/// принудительно. Значение нормализуется ядром: неизвестное или отсутствующее
/// трактуется как `auto`.
#[tauri::command]
pub async fn interface_mode(state: State<'_, Mutex<AppState>>) -> Result<String, String> {
    crate::commands::with_app_host(state.inner(), |host| host.interface_mode()).await
}
