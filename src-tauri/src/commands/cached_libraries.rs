//! Команда перечисления сохранённых индексов библиотек.

use tauri::command;

use serde::Serialize;

/// Сведения о сохранённой библиотеке.
#[derive(Debug, Serialize)]
pub struct CachedLibrary {
    /// Путь к библиотеке.
    pub path: String,
    /// Признак доступности директории.
    pub available: bool,
}

/// Получение сохранённых индексов и состояния исходных директорий.
#[command]
pub fn list_cached_libraries() -> Result<Vec<CachedLibrary>, String> {
    Ok(Vec::new())
}
