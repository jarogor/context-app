//! Команда получения текстового содержимого книги.

use std::sync::Mutex;

use tauri::State;

use crate::catalog::{repository, FileKind};
use crate::commands::BookContent;
use crate::library::Library;
use crate::reading;

/// Получение текстового содержимого книги для read-view.
#[tauri::command]
pub fn get_book_content(
    state: State<'_, Mutex<Library>>,
    book_id: i64,
) -> Result<BookContent, String> {
    let library = state.lock().map_err(|e| e.to_string())?;
    let Some(book) =
        repository::get_book(library.connection(), book_id).map_err(|e| e.to_string())?
    else {
        return Err("Книга не найдена".to_string());
    };
    let file = book
        .files
        .iter()
        .find(|f| f.kind == FileKind::Book)
        .ok_or_else(|| "Файл книги не найден".to_string())?;
    let abs_path = library.root().join(&file.path);
    let text = reading::extract_book_text(&abs_path).map_err(|e| e.to_string())?;
    Ok(BookContent {
        title: book.title,
        authors: book.authors.iter().map(|a| a.name.clone()).collect(),
        text,
    })
}
