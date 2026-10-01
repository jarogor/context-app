//! IPC-команды чтения книги по вложению вкладки.
//!
//! Рабочее место не знает, откуда книга: вкладка адресует файл путём, а ядро
//! отдаёт интерфейсу содержимое, форматы и порции файла, не интерпретируя их по
//! предметному смыслу.

use std::sync::Mutex;

use serde_json::Value;
use tauri::State;

use crate::plugin::AppState;

/// Форматы, поддерживаемые плагинами рабочего места.
#[tauri::command]
pub fn reader_formats(state: State<'_, Mutex<AppState>>) -> Result<Vec<String>, String> {
    let mut state = state.lock().map_err(|error| error.to_string())?;
    Ok(state.reader()?.workplace_formats())
}

/// Идентификатор плагина рабочего места, обслуживающего формат, либо `null`.
#[tauri::command]
pub fn reader_plugin_for_format(
    state: State<'_, Mutex<AppState>>,
    format: String,
) -> Result<Value, String> {
    let mut state = state.lock().map_err(|error| error.to_string())?;
    match state.reader()?.workplace_plugin_for_format(&format) {
        Some(id) => Ok(Value::String(id)),
        None => Ok(Value::Null),
    }
}

/// Модуль рисования плагина рабочего места как HTML.
#[tauri::command]
pub fn reader_viewer(
    state: State<'_, Mutex<AppState>>,
    plugin_id: String,
) -> Result<String, String> {
    let mut state = state.lock().map_err(|error| error.to_string())?;
    let path = state
        .reader()?
        .viewer_path(&plugin_id)
        .ok_or_else(|| format!("плагин рабочего места не найден: {plugin_id}"))?;
    std::fs::read_to_string(&path)
        .map_err(|error| format!("не удалось прочитать модуль рисования: {error}"))
}

/// Список файлов модуля рисования плагина рабочего места.
#[tauri::command]
pub fn reader_viewer_files(
    state: State<'_, Mutex<AppState>>,
    plugin_id: String,
) -> Result<Value, String> {
    let mut state = state.lock().map_err(|error| error.to_string())?;
    state.viewer_files(&plugin_id)
}

/// Содержимое файла модуля рисования плагина рабочего места (base64).
#[tauri::command]
pub fn reader_viewer_file(
    state: State<'_, Mutex<AppState>>,
    plugin_id: String,
    path: String,
) -> Result<Value, String> {
    let mut state = state.lock().map_err(|error| error.to_string())?;
    state.viewer_file(&plugin_id, &path)
}

/// Содержимое книги по пути (opaque-модель source-плагина).
#[tauri::command]
pub fn reader_content(state: State<'_, Mutex<AppState>>, path: String) -> Result<Value, String> {
    let mut state = state.lock().map_err(|error| error.to_string())?;
    state.reader_content(&path)
}

/// Открытие файла книги системным приложением.
#[tauri::command]
pub fn reader_open_external(
    state: State<'_, Mutex<AppState>>,
    path: String,
) -> Result<Value, String> {
    let mut state = state.lock().map_err(|error| error.to_string())?;
    state.reader_open_external(&path)?;
    Ok(serde_json::json!({ "opened": true }))
}

/// Порция содержимого книги по пути.
#[tauri::command]
pub fn reader_book_chunk(
    state: State<'_, Mutex<AppState>>,
    path: String,
    offset: usize,
    length: usize,
) -> Result<Value, String> {
    let mut state = state.lock().map_err(|error| error.to_string())?;
    state.workplace_chunk(&path, offset, length)
}

/// Сброс кэша содержимого книги по пути (после переуказания файла).
#[tauri::command]
pub fn reader_forget_book(
    state: State<'_, Mutex<AppState>>,
    path: String,
) -> Result<Value, String> {
    let mut state = state.lock().map_err(|error| error.to_string())?;
    state.forget_workplace_file(&path);
    Ok(serde_json::json!({ "forgotten": true }))
}
