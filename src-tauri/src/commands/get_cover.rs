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
pub fn get_cover(
    state: State<'_, Mutex<Library>>,
    book_id: String,
) -> Result<Option<String>, String> {
    let mut library = state.lock().map_err(|e| e.to_string())?;
    if library.is_indexing() {
        return Ok(None);
    }
    if library.mode() == crate::library::LibraryMode::External {
        let response = library
            .invoke_source_operation("cover", serde_json::json!({ "book_id": book_id }))
            .map_err(|error| error.to_string())?;
        let value: serde_json::Value =
            serde_json::from_str(&response).map_err(|error| error.to_string())?;
        let mime = match value.get("format").and_then(|value| value.as_str()) {
            Some("png") => "image/png",
            Some("gif") => "image/gif",
            Some("webp") => "image/webp",
            _ => "image/jpeg",
        };
        return Ok(value
            .get("data")
            .and_then(|value| value.as_str())
            .map(|data| format!("data:{mime};base64,{data}")));
    }
    library.sync_if_needed().map_err(|e| e.to_string())?;
    let book_id = book_id
        .parse::<i64>()
        .map_err(|_| "Некорректный идентификатор книги".to_string())?;
    let Some(book) =
        repository::get_book(library.connection(), book_id).map_err(|e| e.to_string())?
    else {
        return Ok(None);
    };
    let cover = match book.files.iter().find(|f| f.kind == FileKind::Cover) {
        Some(c) => c,
        None => return Ok(None),
    };
    let abs_path = library
        .resolve_file_path(&cover.path)
        .map_err(|error| error.to_string())?;
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
