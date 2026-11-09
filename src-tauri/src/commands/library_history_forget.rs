//! Удаление записи истории открытых библиотек.

use std::sync::Mutex;

use serde_json::Value;
use tauri::State;

use crate::library_history;
use crate::plugin::AppState;

/// Удаление записи истории по пути библиотеки.
///
/// Удаление активной библиотеки выгружает её: сессия возвращается в пустое
/// состояние, а интерфейс получает событие с `path: null` и закрывает раздел.
/// Держать открытой библиотеку, которой больше нет в списке, нельзя — иначе
/// после удаления продолжали бы читаться её книги.
///
/// Команда асинхронная: ждать общий `Mutex<AppState>`, который может быть занят
/// тяжёлой операцией базового плагина, нельзя на главном потоке — иначе
/// подвисает интерфейс.
#[tauri::command]
pub async fn library_history_forget(
    state: State<'_, Mutex<AppState>>,
    path: String,
) -> Result<Value, String> {
    let (session, history_root) = {
        let state = crate::commands::lock_state(state.inner())?;
        (state.session.clone(), state.app_state_root().to_path_buf())
    };

    library_history::forget(&history_root, &path).map_err(|error| error.to_string())?;

    let released = {
        let mut session = session
            .lock()
            .map_err(|_| "сессия плагинов недоступна".to_string())?;
        match session.active_library() {
            Some((active_path, _, _)) if active_path == path => {
                session.release();
                true
            }
            _ => false,
        }
    };

    if released {
        // Сменился состав активных плагинов — перечитываем настройки сессии.
        let mut state = crate::commands::lock_state(state.inner())?;
        state.after_session_reload();
        // `path: null` означает «активной библиотеки нет»: интерфейс закрывает
        // раздел и показывает пустое состояние.
        crate::plugin::relay::emit("source-catalog-changed", Value::Null);
    }

    Ok(serde_json::json!({ "forgotten": path, "released": released }))
}
