//! Команда получения состояния source-сессии.

use std::sync::Mutex;

use serde::Serialize;
use tauri::State;

use crate::plugin::PluginHostSession;

#[derive(Serialize)]
pub struct SourceInfo {
    /// Режим активного source-плагина.
    pub kind: String,
    /// Имя активного source-плагина.
    pub source_name: Option<String>,
    /// Признак выполняющейся фоновой индексации.
    pub indexing: bool,
    /// Текущий этап загрузки библиотеки.
    pub stage: String,
}

/// Получение состояния активного source-плагина для UI.
#[tauri::command]
pub fn get_source_info(state: State<'_, Mutex<PluginHostSession>>) -> Result<SourceInfo, String> {
    let host = state.lock().map_err(|e| e.to_string())?;
    Ok(SourceInfo {
        kind: host.kind().to_string(),
        source_name: host.provider().map(str::to_string),
        indexing: host.is_indexing(),
        stage: host.stage().to_string(),
    })
}
