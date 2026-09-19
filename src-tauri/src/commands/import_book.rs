//! Команда импорта книги через library plugin.

use std::sync::Mutex;

use serde_json::Value;
use tauri::State;

use crate::journal::{get_journal_handle, Severity};
use crate::plugin::PluginSession;

/// Импорт книги из EPUB-файла через opaque operation library plugin.
#[tauri::command]
pub fn import_book(
    state: State<'_, Mutex<PluginSession>>,
    source_path: String,
) -> Result<Value, String> {
    let mut library = state.lock().map_err(|error| error.to_string())?;
    library
        .invoke("import", serde_json::json!({ "path": source_path }))
        .map_err(|error| {
            let message = error.to_string();
            get_journal_handle().add_user(
                "Ошибка импорта книги",
                Severity::Error,
                "library",
                serde_json::json!({ "error": message }),
            );
            message
        })
        .and_then(|response| serde_json::from_str(&response).map_err(|error| error.to_string()))
}
