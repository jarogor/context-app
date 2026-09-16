//! Команда выбора и открытия библиотеки.

use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, State};

use crate::library::Library;

/// Открытие библиотеки по выбранной пользователем директории.
#[tauri::command]
pub async fn open_library(
    app: AppHandle,
    state: State<'_, Mutex<Library>>,
    path: String,
) -> Result<String, String> {
    let selected_path = path.clone();
    let selected =
        tauri::async_runtime::spawn_blocking(move || Library::open_for_selection(selected_path))
            .await
            .map_err(|error| error.to_string())?
            .map_err(|error| error.to_string())?;
    {
        let mut current = state.lock().map_err(|error| error.to_string())?;
        *current = selected;
    }

    tauri::async_runtime::spawn_blocking(move || {
        let root = std::path::Path::new(&path);
        if let Ok(mut current) = app.state::<Mutex<Library>>().lock() {
            current.set_stage("scanning");
        }
        let _ = app.emit("library-progress", "scanning");
        let result = Library::prepare_selected(root);
        if let Ok((is_calibre, connection, index)) = result {
            if let Ok(mut current) = app.state::<Mutex<Library>>().lock() {
                current.set_stage("indexing");
            }
            let _ = app.emit("library-progress", "indexing");
            if let Ok(mut current) = app.state::<Mutex<Library>>().lock() {
                if current.root() == root {
                    let installed = if is_calibre {
                        current.promote_calibre(connection, index.expect("Calibre index"))
                    } else {
                        current.install_portable(connection);
                        Ok(())
                    };
                    if installed.is_ok() {
                        let _ = app.emit("library-catalog-changed", ());
                    }
                }
            }
        }
    });
    Ok("loading".to_string())
}
