//! Признак неприменённых изменений активности плагинов.

use std::sync::Mutex;

use serde_json::Value;
use tauri::State;

use crate::plugin::AppState;

/// Есть ли изменения активности, требующие переоткрытия библиотеки или перезапуска.
///
/// Команда асинхронная: ждать общий `Mutex<AppState>`, который может быть занят
/// тяжёлой операцией базового плагина, нельзя на главном потоке — иначе
/// подвисает интерфейс.
#[tauri::command]
pub async fn plugin_activation_pending(state: State<'_, Mutex<AppState>>) -> Result<Value, String> {
    let pending = crate::commands::plugin_operation::with_session(state.inner(), |session| {
        session.activation_pending()
    })?;
    Ok(serde_json::json!({ "pending": pending }))
}
