//! Лимит числа открытых вкладок рабочего места из настроек приложения.

use std::sync::Mutex;

use tauri::State;

use crate::plugin::AppState;

/// Лимит числа открытых вкладок рабочего места.
///
/// Значение нормализуется ядром: отсутствующее или некорректное значение
/// заменяется значением по умолчанию, а значение меньше единицы приводится к
/// единице. Команда асинхронная: чтение настройки идёт через runtime базовых
/// плагинов и ждёт общий `Mutex<AppState>`, который может быть занят тяжёлой
/// операцией, — на главном потоке это морозило бы интерфейс.
#[tauri::command]
pub async fn window_open_tabs_limit(state: State<'_, Mutex<AppState>>) -> Result<u32, String> {
    let mut state = crate::commands::lock_state(state.inner())?;
    Ok(state.app_host()?.open_tabs_limit())
}
