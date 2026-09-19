//! Команда получения списка книг.

use std::sync::Mutex;

use tauri::State;

use crate::plugin::PluginSession;
use serde_json::Value;

/// Получение полного списка книг со всеми связями.
#[tauri::command]
pub fn list_books(state: State<'_, Mutex<PluginSession>>) -> Result<Value, String> {
    let mut library = state.lock().map_err(|e| e.to_string())?;
    if library.is_indexing() {
        return Ok(Value::Array(Vec::new()));
    }
    let response = library
        .invoke("list", serde_json::json!({}))
        .map_err(|error| error.to_string())?;
    let books = source_books(&response)?;
    Ok(books)
}

/// Извлечение списка книг из opaque-ответа source-плагина.
fn source_books(response: &str) -> Result<Value, String> {
    let value: Value = serde_json::from_str(response).map_err(|error| error.to_string())?;
    let books = if value.is_array() {
        value
    } else {
        value
            .get("catalog")
            .and_then(|catalog| catalog.get("books"))
            .cloned()
            .ok_or_else(|| "source-плагин вернул каталог без списка книг".to_string())?
    };
    let books = books
        .as_array()
        .ok_or_else(|| "source-плагин вернул некорректный список книг".to_string())?
        .iter()
        .map(normalize_source_book)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Value::Array(books))
}

/// Преобразование нейтральной книги source-плагина в публичную модель UI.
pub(crate) fn normalize_source_book(book: &Value) -> Result<Value, String> {
    let id = book
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| "source-книга не содержит строковый идентификатор".to_string())?;
    let authors = book
        .get("authors")
        .and_then(Value::as_array)
        .ok_or_else(|| "source-книга не содержит авторов".to_string())?
        .iter()
        .enumerate()
        .map(|(index, author)| {
            serde_json::json!({
                "id": index,
                "name": author.as_str().unwrap_or_default()
            })
        })
        .collect::<Vec<_>>();
    let files = book
        .get("files")
        .and_then(Value::as_array)
        .ok_or_else(|| "source-книга не содержит файлов".to_string())?
        .iter()
        .enumerate()
        .map(|(index, file)| {
            serde_json::json!({
                "id": index,
                "book_id": id,
                "kind": file.get("kind").cloned().unwrap_or(Value::Null),
                "path": file.get("path").cloned().unwrap_or(Value::Null),
                "format": file.get("format").cloned().unwrap_or(Value::Null)
            })
        })
        .collect::<Vec<_>>();
    Ok(serde_json::json!({
        "id": id,
        "uuid": id,
        "title": book.get("title").cloned().unwrap_or(Value::Null),
        "created_at": "",
        "updated_at": "",
        "authors": authors,
        "series": [],
        "tags": [],
        "files": files
    }))
}

#[cfg(test)]
#[path = "list_books_tests.rs"]
mod tests;
