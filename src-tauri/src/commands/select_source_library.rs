//! Открытие внешней библиотеки с выбором source-плагина по `probe`.

use std::sync::Mutex;

use serde_json::Value;
use tauri::State;

use crate::library_history;
use crate::plugin::AppState;

/// Выбор source-плагина для директории, настройка сессии и запись истории.
///
/// Команда асинхронная, чтобы тяжёлое открытие/индексация не блокировали
/// главный поток и интерфейс мог отрисовать прогресс.
#[tauri::command]
pub async fn select_source_library(
    state: State<'_, Mutex<AppState>>,
    path: String,
    storage_root: String,
) -> Result<Value, String> {
    let mut state = crate::commands::lock_state(state.inner())?;

    let provider = state
        .session
        .select_source(path.clone(), false, storage_root)
        .map_err(|error| error.to_string())?;
    let provider_name = state.session.plugin_name(&provider).unwrap_or_default();

    state
        .session
        .invoke(
            "open",
            serde_json::json!({ "mode": "external", "path": path }),
        )
        .map_err(|error| error.to_string())?;

    let history_root = state.app_state_root.clone();
    library_history::remember(&history_root, &path, &provider)
        .map_err(|error| error.to_string())?;

    // Сессия перезагружена — перечитываем настройки и сообщаем стору.
    state.after_session_reload();

    let _ = state.app_host().map(|host| host.drain_and_deliver());

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
