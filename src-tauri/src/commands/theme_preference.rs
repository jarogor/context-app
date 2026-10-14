//! Предпочтение темы оформления из настроек приложения.

use std::sync::Mutex;

use tauri::State;

use crate::plugin::AppState;

/// Предпочтение темы оформления: `light`, `dark` или `system`.
///
/// Чтение идёт через runtime базовых плагинов. Готовность фоновой сборки
/// ожидается вне общего замка состояния, поэтому тяжёлая компиляция не держит
/// лёгкие команды.
#[tauri::command]
pub async fn theme_preference(state: State<'_, Mutex<AppState>>) -> Result<String, String> {
    crate::commands::with_app_host(state.inner(), |host| host.theme_preference()).await
}
