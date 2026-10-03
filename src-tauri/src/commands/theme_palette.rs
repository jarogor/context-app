//! Палитра оформления из настроек приложения.

use std::sync::Mutex;

use tauri::State;

use crate::plugin::AppState;

/// Палитра оформления интерфейса (`gruvbox`, `mist`, …).
///
/// Команда асинхронная: чтение настройки идёт через runtime базовых плагинов и
/// ждёт общий `Mutex<AppState>`, который может быть занят тяжёлой операцией, —
/// на главном потоке это морозило бы интерфейс.
#[tauri::command]
pub async fn theme_palette(state: State<'_, Mutex<AppState>>) -> Result<String, String> {
    let mut state = state.lock().map_err(|error| error.to_string())?;
    Ok(state.app_host()?.theme_palette())
}
