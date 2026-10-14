//! Лимит числа открытых вкладок рабочего места из настроек приложения.

use std::sync::Mutex;

use tauri::State;

use crate::plugin::AppState;

/// Лимит числа открытых вкладок рабочего места.
///
/// Значение нормализуется ядром: отсутствующее или некорректное значение
/// заменяется значением по умолчанию, а значение меньше единицы приводится к
/// единице. Чтение идёт через runtime базовых плагинов; готовность фоновой
/// сборки ожидается вне общего замка состояния, поэтому тяжёлая компиляция не
/// держит лёгкие команды.
#[tauri::command]
pub async fn window_open_tabs_limit(state: State<'_, Mutex<AppState>>) -> Result<u32, String> {
    crate::commands::with_app_host(state.inner(), |host| host.open_tabs_limit()).await
}
