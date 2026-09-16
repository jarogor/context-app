//! Команда получения списка книг.

use std::sync::Mutex;

use tauri::{AppHandle, Emitter, State};

use crate::catalog::{repository, Book};
use crate::library::Library;

/// Получение полного списка книг со всеми связями.
#[tauri::command]
pub fn list_books(app: AppHandle, state: State<'_, Mutex<Library>>) -> Result<Vec<Book>, String> {
    let mut library = state.lock().map_err(|e| e.to_string())?;
    if library.is_indexing() {
        return Ok(Vec::new());
    }
    let was_dirty = library.is_dirty();
    library.sync_if_needed().map_err(|e| e.to_string())?;
    let books = repository::list_books(library.connection()).map_err(|e| e.to_string())?;
    if was_dirty {
        app.emit("library-catalog-changed", ())
            .map_err(|e| e.to_string())?;
    }
    Ok(books)
}
