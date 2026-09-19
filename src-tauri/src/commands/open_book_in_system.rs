//! Команда открытия файла книги системным приложением.

use std::sync::Mutex;

use tauri::State;

use crate::plugin::PluginSession;

/// Открытие файла книги внешним приложением по умолчанию.
#[tauri::command]
pub fn open_book_in_system(
    state: State<'_, Mutex<PluginSession>>,
    book_id: String,
) -> Result<(), String> {
    let mut library = state.lock().map_err(|e| e.to_string())?;
    library.sync().map_err(|e| e.to_string())?;
    let response = library
        .invoke("open_external", serde_json::json!({ "book_id": book_id }))
        .map_err(|error| error.to_string())?;
    serde_json::from_str::<serde_json::Value>(&response).map_err(|error| error.to_string())?;
    Ok(())
}
