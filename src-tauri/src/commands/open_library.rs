//! Команда выбора и открытия библиотеки.

use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, State};

use crate::journal::get_journal_handle;
use crate::plugin::PluginSession;

/// Открытие библиотеки по выбранной пользователем директории.
#[tauri::command]
pub async fn open_library(
    app: AppHandle,
    state: State<'_, Mutex<PluginSession>>,
    path: String,
) -> Result<String, String> {
    let selected_path = path.clone();
    let bundled_plugins_dir = app
        .path()
        .resource_dir()
        .map_err(|error| error.to_string())?
        .join("plugins");
    let background_plugins_dir = bundled_plugins_dir.clone();
    let selected = tauri::async_runtime::spawn_blocking(move || {
        PluginSession::open_for_selection(selected_path, bundled_plugins_dir)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())?;
    {
        let mut current = state.lock().map_err(|error| error.to_string())?;
        *current = selected;
    }

    tauri::async_runtime::spawn_blocking(move || {
        let root = std::path::Path::new(&path);
        if let Ok(mut current) = app.state::<Mutex<PluginSession>>().lock() {
            current.set_stage("scanning");
        }
        let _ = app.emit("library-progress", "scanning");
        let result = PluginSession::prepare_selected(root, background_plugins_dir);
        if let Ok((is_external, source)) = result {
            if let Ok(mut current) = app.state::<Mutex<PluginSession>>().lock() {
                current.set_stage("indexing");
            }
            let _ = app.emit("library-progress", "indexing");
            if let Ok(mut current) = app.state::<Mutex<PluginSession>>().lock() {
                if current.root() == root {
                    let installed = if is_external {
                        current.promote_provider(source.expect("имя источника"))
                    } else {
                        current.install_portable()
                    };
                    if installed.is_ok() {
                        let _ = app.emit("library-catalog-changed", ());
                    } else if let Err(error) = installed {
                        let handle = get_journal_handle();
                        handle.add_technical(
                            "open library error",
                            root.display().to_string(),
                            serde_json::json!({ "error": error.to_string() }),
                        );
                        if let Ok(mut current) = app.state::<Mutex<PluginSession>>().lock() {
                            current.set_stage("error");
                        }
                        let _ = app.emit("library-open-error", error.to_string());
                    }
                }
            }
        } else if let Err(error) = result {
            let handle = get_journal_handle();
            handle.add_technical(
                "open library error",
                root.display().to_string(),
                serde_json::json!({ "error": error.to_string() }),
            );
            if let Ok(mut current) = app.state::<Mutex<PluginSession>>().lock() {
                current.set_stage("error");
            }
            let _ = app.emit("library-open-error", error.to_string());
        }
    });
    Ok("loading".to_string())
}
