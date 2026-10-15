//! IPC-команды чтения книги по вложению вкладки.
//!
//! Рабочее место не знает, откуда книга: вкладка адресует файл путём, а ядро
//! отдаёт интерфейсу содержимое, форматы и порции файла, не интерпретируя их по
//! предметному смыслу.
//!
//! Тяжёлая сборка runtime чтения идёт в фоне. Команды получают дескриптор
//! runtime под коротким общим замком состояния и ждут готовности уже вне его —
//! на замке самого runtime, чтобы не морозить лёгкие команды.

use std::sync::{Arc, Mutex};

use serde_json::Value;
use tauri::State;

use crate::plugin::{AppState, PluginRuntime, SharedRuntime};

/// Дескриптор runtime чтения под коротким общим замком состояния.
fn reader_handle(state: &Mutex<AppState>) -> Result<Arc<SharedRuntime<PluginRuntime>>, String> {
    let mut state = crate::commands::lock_state(state)?;
    Ok(state.reader_handle())
}

/// Форматы, поддерживаемые плагинами рабочего места.
///
/// Готовность runtime чтения ожидается после освобождения общего замка
/// состояния, поэтому команда не держит его на время компиляции WASM.
#[tauri::command]
pub async fn reader_formats(state: State<'_, Mutex<AppState>>) -> Result<Vec<String>, String> {
    let handle = reader_handle(state.inner())?;
    handle.with_ready(|runtime| runtime.supported_formats())
}

/// Идентификатор плагина рабочего места, обслуживающего формат, либо `null`.
#[tauri::command]
pub async fn reader_plugin_for_format(
    state: State<'_, Mutex<AppState>>,
    format: String,
) -> Result<Value, String> {
    let handle = reader_handle(state.inner())?;
    handle.with_ready(|runtime| match runtime.format_plugin_for_format(&format) {
        Some(id) => Value::String(id),
        None => Value::Null,
    })
}

/// Модуль рисования плагина рабочего места как HTML.
#[tauri::command]
pub async fn reader_viewer(
    state: State<'_, Mutex<AppState>>,
    plugin_id: String,
) -> Result<String, String> {
    let handle = reader_handle(state.inner())?;
    handle.with_ready(|runtime| {
        let path = runtime
            .viewer_path(&plugin_id)
            .ok_or_else(|| format!("плагин рабочего места не найден: {plugin_id}"))?;
        std::fs::read_to_string(&path)
            .map_err(|error| format!("не удалось прочитать модуль рисования: {error}"))
    })?
}

/// Список файлов модуля рисования плагина рабочего места.
#[tauri::command]
pub async fn reader_viewer_files(
    state: State<'_, Mutex<AppState>>,
    plugin_id: String,
) -> Result<Value, String> {
    let handle = reader_handle(state.inner())?;
    handle.with_ready(|runtime| AppState::viewer_files_of(runtime, &plugin_id))?
}

/// Содержимое файла модуля рисования плагина рабочего места (base64).
#[tauri::command]
pub async fn reader_viewer_file(
    state: State<'_, Mutex<AppState>>,
    plugin_id: String,
    path: String,
) -> Result<Value, String> {
    let handle = reader_handle(state.inner())?;
    handle.with_ready(|runtime| AppState::viewer_file_of(runtime, &plugin_id, &path))?
}

/// Содержимое книги по пути (opaque-модель source-плагина).
#[tauri::command]
pub async fn reader_content(
    state: State<'_, Mutex<AppState>>,
    path: String,
) -> Result<Value, String> {
    let handle = reader_handle(state.inner())?;
    handle.with_ready(|runtime| AppState::reader_content_of(runtime, &path))?
}

/// Открытие файла книги системным приложением.
#[tauri::command]
pub async fn reader_open_external(
    state: State<'_, Mutex<AppState>>,
    path: String,
) -> Result<Value, String> {
    let handle = reader_handle(state.inner())?;
    handle.with_ready(|runtime| AppState::reader_open_external_of(runtime, &path))??;
    Ok(serde_json::json!({ "opened": true }))
}

/// Порция содержимого книги по пути.
#[tauri::command]
pub async fn reader_book_chunk(
    state: State<'_, Mutex<AppState>>,
    path: String,
    offset: usize,
    length: usize,
) -> Result<Value, String> {
    let mut state = crate::commands::lock_state(state.inner())?;
    state.workplace_chunk(&path, offset, length)
}

/// Сброс кэша содержимого книги по пути (после переуказания файла).
#[tauri::command]
pub async fn reader_forget_book(
    state: State<'_, Mutex<AppState>>,
    path: String,
) -> Result<Value, String> {
    let mut state = crate::commands::lock_state(state.inner())?;
    state.forget_workplace_file(&path);
    Ok(serde_json::json!({ "forgotten": true }))
}
