//! Команда поиска книг.

use std::sync::Mutex;

use tauri::State;

use crate::catalog::{repository, Book};
use crate::library::Library;

/// Поиск книг по названию или автору.
#[tauri::command]
pub fn search_books(state: State<'_, Mutex<Library>>, query: String) -> Result<Vec<Book>, String> {
    let mut library = state.lock().map_err(|e| e.to_string())?;
    if library.is_indexing() {
        return Ok(Vec::new());
    }
    library.sync_if_needed().map_err(|e| e.to_string())?;
    repository::search_books(library.connection(), &query).map_err(|e| e.to_string())
}
