//! Команда поиска книг.

use std::sync::Mutex;

use tauri::State;

use crate::commands::list_books::normalize_source_book;
use crate::plugin::PluginSession;
use serde_json::Value;

/// Поиск книг по названию или автору.
#[tauri::command]
pub fn search_books(
    state: State<'_, Mutex<PluginSession>>,
    query: String,
) -> Result<Value, String> {
    let mut library = state.lock().map_err(|e| e.to_string())?;
    if library.is_indexing() {
        return Ok(Value::Array(Vec::new()));
    }
    let response = library
        .invoke("search", serde_json::json!({ "query": query }))
        .map_err(|error| error.to_string())?;
    let value: Value = serde_json::from_str(&response).map_err(|error| error.to_string())?;
    let books = value
        .get("books")
        .and_then(Value::as_array)
        .ok_or_else(|| "source-плагин вернул ответ поиска без списка книг".to_string())?
        .iter()
        .map(normalize_source_book)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Value::Array(books))
}

#[cfg(test)]
#[path = "search_books_tests.rs"]
mod tests;
