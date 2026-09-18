//! Команда открытия файла книги системным приложением.

use std::sync::Mutex;

use tauri::State;

use crate::catalog::{repository, FileKind};
use crate::library::Library;

/// Открытие файла книги внешним приложением по умолчанию.
#[tauri::command]
pub fn open_book_in_system(
    state: State<'_, Mutex<Library>>,
    book_id: String,
) -> Result<(), String> {
    let mut library = state.lock().map_err(|e| e.to_string())?;
    if library.mode() == crate::library::LibraryMode::External {
        let response = library
            .invoke_source_operation("open_external", serde_json::json!({ "book_id": book_id }))
            .map_err(|error| error.to_string())?;
        serde_json::from_str::<serde_json::Value>(&response).map_err(|error| error.to_string())?;
        return Ok(());
    }
    library.sync_if_needed().map_err(|e| e.to_string())?;
    let book_id = book_id
        .parse::<i64>()
        .map_err(|_| "Некорректный идентификатор книги".to_string())?;
    let book = repository::get_book(library.connection(), book_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Книга не найдена".to_string())?;
    let file = book
        .files
        .iter()
        .find(|file| file.kind == FileKind::Book)
        .ok_or_else(|| "Файл книги не найден".to_string())?;
    let path = library
        .resolve_file_path(&file.path)
        .map_err(|error| error.to_string())?;
    open::that(path).map_err(|e| e.to_string())
}
