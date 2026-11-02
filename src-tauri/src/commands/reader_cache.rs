//! IPC-команды дискового кэша свойств открытого файла.
//!
//! Свойства файла (закладки, число страниц, превью и встроенные пометки)
//! добываются дорого и нужны при каждом открытии вкладки. Оболочка читает кэш
//! до загрузки плагина и отдаёт найденное обратно по мере готовности; ядро
//! хранит это непрозрачно и определяет свежесть по размеру и времени изменения
//! файла.
//!
//! Все команды `async` и берут общий замок состояния только на чтение каталога
//! состояния, а файловые операции идут вне его: запись превью не должна
//! задерживать сохранение настроек и клики по интерфейсу.

use std::sync::Mutex;

use serde_json::Value;
use tauri::State;

use crate::plugin::AppState;
use crate::reader_cache::{self, ThumbInput};

/// Каталог состояния приложения для кэша свойств.
fn state_root(state: &Mutex<AppState>) -> Result<std::path::PathBuf, String> {
    let state = crate::commands::lock_state(state)?;
    Ok(state.app_state_root().to_path_buf())
}

/// Свойства книги из кэша: `null`, если записи нет или файл изменился.
#[tauri::command]
pub async fn reader_cache_load(
    state: State<'_, Mutex<AppState>>,
    path: String,
) -> Result<Value, String> {
    let root = state_root(state.inner())?;
    let (size, mtime_ms) = AppState::file_fingerprint(&path);
    let Some(meta) = reader_cache::read_meta(&root, &path) else {
        return Ok(Value::Null);
    };
    if !reader_cache::is_fresh(&meta, size, mtime_ms) {
        return Ok(Value::Null);
    }
    let entry = reader_cache::read_entry(&root, &path, &meta);
    if entry.is_empty() {
        return Ok(Value::Null);
    }
    serde_json::to_value(entry).map_err(|error| error.to_string())
}

/// Сохранение порции свойств книги.
///
/// Поля необязательны: оболочка присылает свойства, пометки и превью по мере
/// готовности, и заданные поля перекрывают прежние.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn reader_cache_save(
    state: State<'_, Mutex<AppState>>,
    path: String,
    properties: Option<Value>,
    annotations: Option<Value>,
    thumbs: Option<Vec<ThumbInput>>,
) -> Result<Value, String> {
    let root = state_root(state.inner())?;
    let (size, mtime_ms) = AppState::file_fingerprint(&path);
    reader_cache::save(
        &root,
        &path,
        size,
        mtime_ms,
        properties,
        annotations,
        &thumbs.unwrap_or_default(),
    )?;
    Ok(Value::Bool(true))
}

/// Удаление кэша книги (после переуказания файла или удаления вкладки).
#[tauri::command]
pub async fn reader_cache_forget(
    state: State<'_, Mutex<AppState>>,
    path: String,
) -> Result<Value, String> {
    let root = state_root(state.inner())?;
    reader_cache::forget(&root, &path)?;
    Ok(Value::Bool(true))
}
