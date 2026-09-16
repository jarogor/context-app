//! Команда перечисления сохранённых индексов библиотек.

use tauri::command;

use crate::calibre::index::cached_libraries;
use crate::calibre::models::CachedLibrary;

/// Получение сохранённых индексов и состояния исходных директорий.
#[command]
pub fn list_cached_libraries() -> Result<Vec<CachedLibrary>, String> {
    cached_libraries().map_err(|error| error.to_string())
}
