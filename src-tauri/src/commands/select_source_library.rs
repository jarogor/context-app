//! Открытие внешней библиотеки с выбором source-плагина по `probe`.

use std::path::Path;
use std::sync::Mutex;

use serde_json::Value;
use tauri::State;

use crate::library_history;
use crate::plugin::AppState;

/// Выбор source-плагина для директории, настройка сессии и запись истории.
///
/// Команда асинхронная, чтобы тяжёлое открытие/индексация не блокировали
/// главный поток и интерфейс мог отрисовать прогресс.
///
/// Если запрошен тот же путь, что уже открыт, команда ничего не переоткрывает:
/// выбор уже загруженной библиотеки не должен заново строить её индекс. Запись
/// в истории при этом всё равно обновляется — библиотеку могли убрать из списка,
/// и без неё повторное открытие не вернуло бы её обратно.
#[tauri::command]
pub async fn select_source_library(
    state: State<'_, Mutex<AppState>>,
    path: String,
    storage_root: String,
) -> Result<Value, String> {
    // Дескриптор сессии и корень истории берутся одним коротким замком: взять
    // общий замок состояния под уже захваченной сессией нельзя — это обратный
    // порядок замков и путь к взаимной блокировке.
    let (session, history_root) = {
        let state = crate::commands::lock_state(state.inner())?;
        (state.session.clone(), state.app_state_root.clone())
    };
    let mut session = session
        .lock()
        .map_err(|_| "сессия плагинов недоступна".to_string())?;

    // Быстрый путь: та же библиотека уже активна — ни опроса source-плагинов, ни
    // переиндексации. Повторный выбор того же каталога ничего не меняет, кроме
    // места записи в истории.
    if let Some((active_path, provider, provider_name)) = session.active_library() {
        if active_path == path {
            drop(session);
            return reuse_active_library(&history_root, &path, &provider, &provider_name);
        }
    }

    let provider = session
        .select_source(path.clone(), false, storage_root)
        .map_err(|error| error.to_string())?;
    let provider_name = session.plugin_name(&provider).unwrap_or_default();

    session
        .invoke(
            "open",
            serde_json::json!({ "mode": "external", "path": path }),
        )
        .map_err(|error| error.to_string())?;
    drop(session);

    library_history::remember(&history_root, &path, &provider)
        .map_err(|error| error.to_string())?;

    // Сессия перезагружена — перечитываем настройки и сообщаем стору.
    let mut state = crate::commands::lock_state(state.inner())?;
    state.after_session_reload();

    // Библиотека открыта — сообщаем интерфейсу, что активная библиотека сменилась.
    crate::plugin::relay::emit(
        "source-catalog-changed",
        serde_json::json!({
            "path": path,
            "provider": provider.clone(),
            "provider_name": provider_name.clone(),
        }),
    );

    Ok(serde_json::json!({ "provider": provider, "provider_name": provider_name }))
}

/// Возврат уже активной библиотеки с записью её в историю.
///
/// Переоткрытия нет: индекс и сессия остаются прежними. Запись обязательна —
/// библиотеку могли убрать из списка, и без неё повторное открытие её бы не
/// вернуло.
fn reuse_active_library(
    history_root: &Path,
    path: &str,
    provider: &str,
    provider_name: &str,
) -> Result<Value, String> {
    library_history::remember(history_root, path, provider).map_err(|error| error.to_string())?;
    Ok(serde_json::json!({
        "provider": provider,
        "provider_name": provider_name,
        "reused": true,
    }))
}

#[cfg(test)]
#[path = "select_source_library_tests.rs"]
mod tests;
