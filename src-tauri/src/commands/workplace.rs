//! IPC-команды плагинов рабочего места.
//!
//! Ядро не интерпретирует содержимое книги и модуль рисования: оно лишь
//! отдаёт интерфейсу форматы, файл модуля рисования и порции содержимого
//! книги по непрозрачной ссылке.

use std::sync::Mutex;

use serde_json::Value;
use tauri::State;

use crate::plugin::AppState;

/// Форматы, поддерживаемые плагинами рабочего места активной сессии.
#[tauri::command]
pub fn workplace_formats(state: State<'_, Mutex<AppState>>) -> Result<Vec<String>, String> {
    let state = state.lock().map_err(|error| error.to_string())?;
    Ok(state.session.runtime().workplace_formats())
}

/// Идентификатор плагина рабочего места, обслуживающего формат, либо `null`.
#[tauri::command]
pub fn workplace_plugin_for_format(
    state: State<'_, Mutex<AppState>>,
    format: String,
) -> Result<Value, String> {
    let state = state.lock().map_err(|error| error.to_string())?;
    match state.session.runtime().workplace_plugin_for_format(&format) {
        Some(id) => Ok(Value::String(id)),
        None => Ok(Value::Null),
    }
}

/// Модуль рисования плагина рабочего места как HTML.
#[tauri::command]
pub fn workplace_viewer(
    state: State<'_, Mutex<AppState>>,
    plugin_id: String,
) -> Result<String, String> {
    let state = state.lock().map_err(|error| error.to_string())?;
    let path = state
        .session
        .runtime()
        .viewer_path(&plugin_id)
        .ok_or_else(|| format!("плагин рабочего места не найден: {plugin_id}"))?;
    std::fs::read_to_string(&path)
        .map_err(|error| format!("не удалось прочитать модуль рисования: {error}"))
}

/// Порция содержимого книги по непрозрачной ссылке.
#[tauri::command]
pub fn workplace_book_chunk(
    state: State<'_, Mutex<AppState>>,
    book_id: String,
    offset: usize,
    length: usize,
) -> Result<Value, String> {
    let mut state = state.lock().map_err(|error| error.to_string())?;
    state.workplace_chunk(&book_id, offset, length)
}
