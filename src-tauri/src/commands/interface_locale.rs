//! Язык интерфейса из настроек приложения.

use std::sync::Mutex;

use tauri::State;

use crate::plugin::AppState;

/// Язык интерфейса: `ru` или `en`.
///
/// Чтение идёт через runtime базовых плагинов. Готовность фоновой сборки
/// ожидается вне общего замка состояния, поэтому тяжёлая компиляция не держит
/// лёгкие команды.
#[tauri::command]
pub async fn interface_locale(state: State<'_, Mutex<AppState>>) -> Result<String, String> {
    crate::commands::with_app_host(state.inner(), |host| host.interface_locale()).await
}
