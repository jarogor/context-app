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

/// Обложка книги по пути (base64) либо `null`, если обложки нет.
///
/// Обложка извлекается из самого файла, поэтому список рабочих мест показывает
/// обложки книг без открытой библиотеки. Результат кэшируется на диске по
/// размеру и времени изменения файла: повторный показ не разбирает книгу снова.
#[tauri::command]
pub async fn reader_cover(
    state: State<'_, Mutex<AppState>>,
    path: String,
) -> Result<Value, String> {
    let (size, mtime_ms) = AppState::file_fingerprint(&path);
    // Кэш проверяется под коротким общим замком; извлечение идёт вне его.
    if let Some(cached) = {
        let mut state = crate::commands::lock_state(state.inner())?;
        state.cover_cache_lookup(&path, size, mtime_ms)
    } {
        return Ok(cover_value(cached.as_ref()));
    }
    let handle = reader_handle(state.inner())?;
    let value = handle.with_ready(|runtime| AppState::reader_cover_of(runtime, &path))??;
    let cover = AppState::cover_data_from_value(&value);
    {
        let mut state = crate::commands::lock_state(state.inner())?;
        state.cover_cache_store(&path, size, mtime_ms, cover);
        state.cover_cache_flush();
    }
    Ok(value)
}

/// Обложки книг рабочего места по списку путей (data URI либо `null`).
///
/// Обложки готовятся за один вызов и кэшируются на диске: список рабочих мест
/// получает их сразу при запуске, а не дорисовывает по одной. Неизвестные пути
/// отбрасываются, порядок ответа значения не имеет — оболочка ищет по пути.
#[tauri::command]
pub async fn workspace_covers(
    state: State<'_, Mutex<AppState>>,
    paths: Vec<String>,
) -> Result<Value, String> {
    let mut result = serde_json::Map::new();
    let mut missing: Vec<String> = Vec::new();
    {
        let mut guard = crate::commands::lock_state(state.inner())?;
        for path in &paths {
            let (size, mtime_ms) = AppState::file_fingerprint(path);
            match guard.cover_cache_lookup(path, size, mtime_ms) {
                Some(cover) => {
                    result.insert(path.clone(), cover_value(cover.as_ref()));
                }
                None => missing.push(path.clone()),
            }
        }
    }
    if missing.is_empty() {
        return Ok(Value::Object(result));
    }
    let handle = reader_handle(state.inner())?;
    let extracted = handle.with_ready(|runtime| {
        let mut values: Vec<(String, Option<Value>)> = Vec::new();
        for path in &missing {
            let value = AppState::reader_cover_of(runtime, path)
                .unwrap_or_else(|_| serde_json::json!({ "data": null }));
            values.push((path.clone(), Some(value)));
        }
        values
    })?;
    {
        let mut guard = crate::commands::lock_state(state.inner())?;
        for (path, value) in extracted {
            let value = value.unwrap_or_else(|| serde_json::json!({ "data": null }));
            let (size, mtime_ms) = AppState::file_fingerprint(&path);
            let cover = AppState::cover_data_from_value(&value);
            guard.cover_cache_store(&path, size, mtime_ms, cover);
            result.insert(path, value);
        }
        guard.cover_cache_flush();
    }
    Ok(Value::Object(result))
}

/// Значение ответа обложки (`{data, format}`) для интерфейса.
fn cover_value(cover: Option<&crate::plugin::cover_cache::CoverData>) -> Value {
    match cover {
        Some(cover) => serde_json::json!({ "data": cover.data, "format": cover.format }),
        None => serde_json::json!({ "data": null }),
    }
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

/// Порция книги из состояния и ответ интерфейсу.
///
/// Вынесено из команды, чтобы весь путь чтения книги (границы порции и ответ)
/// проверялся тестом целиком: ошибка в ответе зацикливает чтение в интерфейсе, и
/// по одной лишь функции порции её не видно.
fn book_chunk_response(
    state: &mut AppState,
    path: &str,
    offset: usize,
    length: usize,
) -> Result<Value, String> {
    state.book_chunk_response(path, offset, length)
}

/// Порция содержимого книги по пути.
///
/// Чтение файла с диска и кодирование base64 идут **вне общего замка состояния**:
/// на медленном носителе (например, библиотеке на USB) порция читается секундами,
/// и замок на это время замораживал весь интерфейс — сохранение настроек и любой
/// клик ждали окончания чтения. Замок берётся только на проверку кэша и запись в
/// него.
#[tauri::command]
pub async fn reader_book_chunk(
    state: State<'_, Mutex<AppState>>,
    path: String,
    offset: usize,
    length: usize,
) -> Result<Value, String> {
    let mut state = crate::commands::lock_state(state.inner())?;
    book_chunk_response(&mut state, &path, offset, length)
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
