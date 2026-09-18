//! Команда импорта книги из EPUB-файла.

use std::sync::Mutex;

use tauri::State;

use crate::catalog::Book;
use crate::journal::{get_journal_handle, Severity};
use crate::library::{Library, LibraryMode};

/// Импорт книги из EPUB-файла в библиотеку.
#[tauri::command]
pub fn import_book(state: State<'_, Mutex<Library>>, source_path: String) -> Result<Book, String> {
    let mut library = state.lock().map_err(|e| e.to_string())?;
    if library.mode() == LibraryMode::External {
        return Err("Внешняя библиотека доступна только для чтения".to_string());
    }
    crate::import::import_book(&mut library, std::path::Path::new(&source_path))
        .map_err(|e| {
            let handle = get_journal_handle();
            handle.add_user(
                "Ошибка импорта книги",
                Severity::Error,
                source_path.clone(),
                serde_json::json!({ "error": e.to_string() }),
            );
            e.to_string()
        })
        .inspect(|book| {
            let handle = get_journal_handle();
            handle.add_user(
                "Книга импортирована",
                Severity::Info,
                source_path.clone(),
                serde_json::json!({ "title": book.title }),
            );
        })
}
