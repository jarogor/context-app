//! Команда получения списка книг.

use std::sync::Mutex;

use tauri::State;

use crate::catalog::{repository, Book};
use crate::library::Library;

/// Получение полного списка книг со всеми связями.
#[tauri::command]
pub fn list_books(state: State<'_, Mutex<Library>>) -> Result<Vec<Book>, String> {
    let library = state.lock().map_err(|e| e.to_string())?;
    repository::list_books(library.connection()).map_err(|e| e.to_string())
}
