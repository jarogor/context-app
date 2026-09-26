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
    let mut state = state.lock().map_err(|error| error.to_string())?;

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

    let sources = state.session.settings_sources();
    let _ = state.app_host.refresh_settings_registry(&sources);

    let history_root = state.app_state_root.clone();
    library_history::remember(&history_root, &path, &provider)
        .map_err(|error| error.to_string())?;

    let _ = state.app_host.drain_and_deliver();

    // Сессия перезагружена — сообщаем стору, что применённое состояние обновилось.
    crate::plugin::relay::emit(
        "plugin-store:changed",
        serde_json::json!({ "reason": "session" }),
    );

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
