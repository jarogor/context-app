//! Команда получения текстового содержимого книги.

use std::sync::Mutex;

use tauri::State;

use crate::commands::BookContent;
use crate::plugin::PluginSession;

/// Получение текстового содержимого книги для read-view.
#[tauri::command]
pub fn get_book_content(
    state: State<'_, Mutex<PluginSession>>,
    book_id: String,
) -> Result<BookContent, String> {
    let mut library = state.lock().map_err(|e| e.to_string())?;
    let response = library
        .invoke("read", serde_json::json!({ "book_id": book_id }))
        .map_err(|error| error.to_string())?;
    let value: serde_json::Value =
        serde_json::from_str(&response).map_err(|error| error.to_string())?;
    Ok(BookContent {
        title: value
            .get("title")
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .to_string(),
        authors: value
            .get("authors")
            .and_then(|value| value.as_array())
            .map(|values| {
                values
                    .iter()
                    .filter_map(|value| value.as_str().map(str::to_string))
                    .collect()
            })
            .unwrap_or_default(),
        text: value
            .get("text")
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .to_string(),
    })
}
