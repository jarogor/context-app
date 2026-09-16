//! Команда выбора и открытия библиотеки.

use std::sync::Mutex;

use tauri::State;

use crate::catalog::open_catalog;
use crate::library::Library;

/// Открытие библиотеки по выбранной пользователем директории.
#[tauri::command]
pub fn open_library(state: State<'_, Mutex<Library>>, path: String) -> Result<(), String> {
    let mut library = Library::open(path).map_err(|error| error.to_string())?;
    open_catalog(library.connection_mut()).map_err(|error| error.to_string())?;

    let mut current = state.lock().map_err(|error| error.to_string())?;
    *current = library;
    Ok(())
}
