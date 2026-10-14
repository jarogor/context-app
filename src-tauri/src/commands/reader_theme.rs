//! Тема области чтения из настроек приложения.

use std::sync::Mutex;

use tauri::State;

use crate::plugin::AppState;

/// Тема области чтения книги: `light` или `dark`.
///
/// Тема области чтения независима от темы интерфейса. Чтение идёт через runtime
/// базовых плагинов; готовность фоновой сборки ожидается вне общего замка
/// состояния, поэтому тяжёлая компиляция не держит лёгкие команды.
#[tauri::command]
pub async fn reader_theme(state: State<'_, Mutex<AppState>>) -> Result<String, String> {
    crate::commands::with_app_host(state.inner(), |host| host.reader_theme()).await
}
