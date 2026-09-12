//! Команда импорта книги из EPUB-файла.

use std::sync::Mutex;

use tauri::State;

use crate::catalog::Book;
use crate::library::Library;

/// Импорт книги из EPUB-файла в библиотеку.
#[tauri::command]
pub fn import_book(state: State<'_, Mutex<Library>>, source_path: String) -> Result<Book, String> {
    let mut library = state.lock().map_err(|e| e.to_string())?;
    crate::import::import_book(&mut library, std::path::Path::new(&source_path))
        .map_err(|e| e.to_string())
}
