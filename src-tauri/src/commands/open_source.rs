//! Команда выбора и открытия source-корня.

use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, State};

use crate::plugin::PluginHostSession;

/// Открытие source-корня по выбранной пользователем директории.
#[tauri::command]
pub async fn open_source(
    app: AppHandle,
    state: State<'_, Mutex<PluginHostSession>>,
    path: String,
) -> Result<String, String> {
    let selected_path = path.clone();
    let bundled_plugins_dir = app
        .path()
        .resource_dir()
        .map_err(|error| error.to_string())?
        .join("plugins");
    let storage_root = crate::config::app_state_dir(&app)?.join("source-state");
    let background_plugins_dir = bundled_plugins_dir.clone();
    let background_storage_root = storage_root.clone();
    let selected = tauri::async_runtime::spawn_blocking(move || {
        PluginHostSession::open_for_selection(selected_path, bundled_plugins_dir, storage_root)
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
        if let Ok(mut current) = app.state::<Mutex<PluginHostSession>>().lock() {
            current.set_stage("scanning");
        }
        let _ = app.emit("source-progress", "scanning");
        let probe_plugins_dir = background_plugins_dir.clone();
        let probe_storage_root = background_storage_root.clone();
        let result =
            PluginHostSession::prepare_selected(root, probe_plugins_dir, probe_storage_root);
        if let Ok((is_external, source)) = result {
            if !is_external {
                let error = "выбранная директория не распознана поддерживаемым source-плагином";
                set_open_error(&app, error.to_string());
                return;
            }
            if let Ok(mut current) = app.state::<Mutex<PluginHostSession>>().lock() {
                current.set_stage("indexing");
            }
            let _ = app.emit("source-progress", "indexing");
            let provider = source.expect("имя источника");
            let open_plugins_dir = background_plugins_dir.clone();
            let open_storage_root = background_storage_root.clone();
            let mut opened = match PluginHostSession::open_for_selection(
                root,
                open_plugins_dir,
                open_storage_root,
            ) {
                Ok(session) => session,
                Err(error) => {
                    set_open_error(&app, error.to_string());
                    return;
                }
            };
            if let Err(error) = opened.promote_provider(provider) {
                set_open_error(&app, error.to_string());
                return;
            }
            if let Ok(mut current) = app.state::<Mutex<PluginHostSession>>().lock() {
                if current.root() == root {
                    *current = opened;
                    let _ = app.emit("source-catalog-changed", ());
                }
            }
        } else if let Err(error) = result {
            set_open_error(&app, error.to_string());
        }
    });
    Ok("loading".to_string())
}

fn set_open_error(app: &AppHandle, message: String) {
    if let Ok(mut current) = app.state::<Mutex<PluginHostSession>>().lock() {
        current.set_stage("error");
    }
    let _ = app.emit("source-open-error", message);
}
