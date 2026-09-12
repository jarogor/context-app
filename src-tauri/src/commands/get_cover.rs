//! Команда получения обложки книги.

use std::fs;
use std::sync::Mutex;

use base64::Engine as _;
use tauri::State;

use crate::catalog::{repository, FileKind};
use crate::library::Library;

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
