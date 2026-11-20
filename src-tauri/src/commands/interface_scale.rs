//! Масштаб шкалы интерфейса из настроек приложения.

use std::sync::Mutex;

use tauri::State;

use crate::plugin::AppState;

/// Масштаб шкалы интерфейса в процентах.
///
/// Допустимые значения — ступени прогрессивной шкалы (70, 80, 90, 100, 110, 125,
/// 150, 175, 200); значение между ступенями приводится к ближайшей, неизвестное
/// трактуется как `100`. Масштаб меняет шкалу целиком: отступы, кегли, радиусы и
/// ширины панелей, а не только текст.
#[tauri::command]
pub async fn interface_scale(state: State<'_, Mutex<AppState>>) -> Result<String, String> {
    crate::commands::with_app_host(state.inner(), |host| host.interface_scale()).await
}
