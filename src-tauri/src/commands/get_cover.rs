//! Команда получения обложки книги.

use std::sync::Mutex;

use tauri::State;

use crate::plugin::PluginSession;

/// Получение изображения обложки книги в формате base64-URI.
///
/// Возвращает `Some(data_uri)` для книг с обложкой или `None`,
/// если обложка отсутствует.
#[tauri::command]
pub fn get_cover(
    state: State<'_, Mutex<PluginSession>>,
    book_id: String,
) -> Result<Option<String>, String> {
    let mut library = state.lock().map_err(|e| e.to_string())?;
    if library.is_indexing() {
        return Ok(None);
    }
    library.sync().map_err(|e| e.to_string())?;
    let response = library
        .invoke("cover", serde_json::json!({ "book_id": book_id }))
        .map_err(|error| error.to_string())?;
    let value: serde_json::Value =
        serde_json::from_str(&response).map_err(|error| error.to_string())?;
    let mime = match value.get("format").and_then(|value| value.as_str()) {
        Some("png") => "image/png",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        _ => "image/jpeg",
    };
    Ok(value
        .get("data")
        .and_then(|value| value.as_str())
        .map(|data| format!("data:{mime};base64,{data}")))
}
