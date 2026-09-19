//! Команда получения режима открытой библиотеки.

use std::sync::Mutex;

use serde::Serialize;
use tauri::State;

use crate::plugin::PluginSession;

#[derive(Serialize)]
pub struct LibraryInfo {
    /// Тип открытой библиотеки: `portable` или `external`.
    pub kind: String,
    /// Имя плагина-источника для внешней библиотеки.
    pub source_name: Option<String>,
    /// Признак выполняющейся фоновой индексации.
    pub indexing: bool,
    /// Текущий этап загрузки библиотеки.
    pub stage: String,
}

/// Получение режима текущей библиотеки для UI.
#[tauri::command]
pub fn get_library_info(state: State<'_, Mutex<PluginSession>>) -> Result<LibraryInfo, String> {
    let library = state.lock().map_err(|e| e.to_string())?;
    Ok(LibraryInfo {
        kind: library.kind().to_string(),
        source_name: library.provider().map(str::to_string),
        indexing: library.is_indexing(),
        stage: library.stage().to_string(),
    })
}
