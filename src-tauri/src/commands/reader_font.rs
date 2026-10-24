//! Гарнитура книги из настроек приложения.

use std::sync::Mutex;

use tauri::State;

use crate::plugin::AppState;

/// Гарнитура книги: `serif` (с засечками) или `sans` (без засечек).
///
/// Шрифт области чтения независим от темы интерфейса и общий для всех книг.
/// Чтение идёт через runtime базовых плагинов; готовность фоновой сборки
/// ожидается вне общего замка состояния, поэтому тяжёлая компиляция не держит
/// лёгкие команды.
#[tauri::command]
pub async fn reader_font(state: State<'_, Mutex<AppState>>) -> Result<String, String> {
    crate::commands::with_app_host(state.inner(), |host| host.reader_font()).await
}
