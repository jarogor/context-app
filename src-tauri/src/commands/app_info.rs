//! Сведения о приложении для страницы «Информация».

use std::sync::Mutex;

use tauri::State;

use crate::plugin::{AppInfo, AppState};

/// Версия приложения из манифеста пакета.
///
/// Команда асинхронная: ждать общий `Mutex<AppState>`, который может быть занят
/// тяжёлой операцией базового плагина, нельзя на главном потоке — иначе
/// подвисает интерфейс.
#[tauri::command]
pub async fn app_info(state: State<'_, Mutex<AppState>>) -> Result<AppInfo, String> {
    let state = crate::commands::lock_state(state.inner())?;
    Ok(state.app_info())
}

/// Установка имени приложения на выбранном языке интерфейса.
///
/// Команда асинхронная: она ждёт общий `Mutex<AppState>`, который может быть
/// занят тяжёлой операцией базового плагина.
#[tauri::command]
pub async fn app_name_set(state: State<'_, Mutex<AppState>>, name: String) -> Result<(), String> {
    let mut state = crate::commands::lock_state(state.inner())?;
    state.set_app_name(name);
    Ok(())
}
