//! Команда получения режима открытой библиотеки.

use std::sync::Mutex;

use serde::Serialize;
use tauri::State;

use crate::library::Library;

#[derive(Serialize)]
pub struct LibraryInfo {
    pub kind: String,
}

/// Получение типа текущей библиотеки для UI.
#[tauri::command]
pub fn get_library_info(state: State<'_, Mutex<Library>>) -> Result<LibraryInfo, String> {
    let library = state.lock().map_err(|e| e.to_string())?;
    Ok(LibraryInfo {
        kind: library.mode().as_str().to_string(),
    })
}
