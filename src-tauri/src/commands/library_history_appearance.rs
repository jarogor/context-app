//! Запись пользовательского оформления библиотеки в истории.

use std::sync::Mutex;

use serde_json::Value;
use tauri::State;

use crate::library_history::{self, LibraryAppearance};
use crate::plugin::AppState;

/// Запись названия, описания, иконки и цвета библиотеки.
///
/// Оформление хранится в истории открытых библиотек: оно относится к записи
/// списка, а не к открытой библиотеке, поэтому доступно и для недоступной
/// директории. Оформление заменяется целиком — так сброс одним действием
/// очищает все поля сразу.
///
/// Команда асинхронная: ждать общий `Mutex<AppState>`, который может быть занят
/// тяжёлой операцией базового плагина, нельзя на главном потоке — иначе
/// подвисает интерфейс.
#[tauri::command]
pub async fn library_history_appearance(
    state: State<'_, Mutex<AppState>>,
    path: String,
    name: Option<String>,
    description: Option<String>,
    icon: Option<String>,
    color: Option<String>,
) -> Result<Value, String> {
    let root = {
        let state = crate::commands::lock_state(state.inner())?;
        state.app_state_root().to_path_buf()
    };
    let appearance = LibraryAppearance {
        name,
        description,
        icon,
        color,
    };
    let updated = library_history::set_appearance(&root, &path, appearance)
        .map_err(|error| error.to_string())?;
    Ok(serde_json::json!({ "path": path, "updated": updated }))
}
