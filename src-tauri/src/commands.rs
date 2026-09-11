//! Tauri IPC-команды: точки входа для фронтенда.

use std::fs;
use std::sync::Mutex;

use base64::Engine as _;
use tauri::State;

use crate::catalog::repository;
use crate::catalog::{Book, FileKind};
use crate::library::Library;
use crate::reading;

/// Содержимое книги для read-view.
#[derive(serde::Serialize)]
pub struct BookContent {
    pub title: String,
    pub authors: Vec<String>,
    pub text: String,
}

/// Импорт книги из EPUB-файла в библиотеку.
#[tauri::command]
pub fn import_book(state: State<'_, Mutex<Library>>, source_path: String) -> Result<Book, String> {
    let mut library = state.lock().map_err(|e| e.to_string())?;
    crate::import::import_book(&mut library, std::path::Path::new(&source_path))
        .map_err(|e| e.to_string())
}

/// Получение полного списка книг со всеми связями.
#[tauri::command]
pub fn list_books(state: State<'_, Mutex<Library>>) -> Result<Vec<Book>, String> {
    let library = state.lock().map_err(|e| e.to_string())?;
    repository::list_books(library.connection()).map_err(|e| e.to_string())
}

/// Получение изображения обложки книги в формате base64-URI.
///
/// Возвращает `Some(data_uri)` для книг с обложкой или `None`,
/// если обложка отсутствует.
#[tauri::command]
pub fn get_cover(state: State<'_, Mutex<Library>>, book_id: i64) -> Result<Option<String>, String> {
    let library = state.lock().map_err(|e| e.to_string())?;
    let Some(book) =
        repository::get_book(library.connection(), book_id).map_err(|e| e.to_string())?
    else {
        return Ok(None);
    };
    let cover = match book.files.iter().find(|f| f.kind == FileKind::Cover) {
        Some(c) => c,
        None => return Ok(None),
    };
    let abs_path = library.root().join(&cover.path);
    let bytes = fs::read(&abs_path).map_err(|e| e.to_string())?;
    let mime = match cover.format.as_str() {
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => "image/jpeg",
    };
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(Some(format!("data:{mime};base64,{encoded}")))
}

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
