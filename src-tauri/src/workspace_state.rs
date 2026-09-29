//! Состояние рабочего места.
//!
//! Хранит состав вкладок и активную вкладку в служебном каталоге приложения.
//! Ядро не интерпретирует содержимое вкладок: книгу, позицию и масштаб ведёт
//! оболочка, а здесь сохраняется непрозрачный для ядра снимок.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Имя файла состояния рабочего места в служебном каталоге.
const WORKSPACE_FILE_NAME: &str = "workspace.json";

/// Вкладка рабочего места.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WorkspaceTab {
    /// Идентификатор экземпляра вкладки.
    pub id: String,
    /// Идентификатор открытой книги.
    pub book_id: String,
    /// Название книги для отображения.
    pub title: String,
    /// Формат книги.
    #[serde(default)]
    pub format: String,
    /// Масштаб чтения в процентах.
    #[serde(default = "default_zoom")]
    pub zoom: u32,
    /// Позиция чтения в процентах.
    #[serde(default)]
    pub position: f64,
    /// Режим чтения вкладки.
    #[serde(default)]
    pub mode: String,
}

/// Состояние рабочего места.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct WorkspaceState {
    /// Вкладки рабочего места в порядке отображения.
    #[serde(default)]
    pub tabs: Vec<WorkspaceTab>,
    /// Идентификатор активной вкладки.
    #[serde(default)]
    pub active_tab_id: Option<String>,
}

/// Значение масштаба по умолчанию.
fn default_zoom() -> u32 {
    100
}

/// Загрузка состояния рабочего места; отсутствующий файл — пустое состояние.
pub fn load(root: &Path) -> Result<WorkspaceState, String> {
    match std::fs::read_to_string(workspace_path(root)) {
        Ok(value) => serde_json::from_str(&value).map_err(|error| error.to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(WorkspaceState::default()),
        Err(error) => Err(error.to_string()),
    }
}

/// Сохранение состояния рабочего места атомарной записью.
pub fn save(root: &Path, state: &WorkspaceState) -> Result<(), String> {
    std::fs::create_dir_all(root).map_err(|error| error.to_string())?;
    let value = serde_json::to_string(state).map_err(|error| error.to_string())?;
    let path = workspace_path(root);
    let temporary = path.with_extension("tmp");
    std::fs::write(&temporary, value).map_err(|error| error.to_string())?;
    std::fs::rename(&temporary, &path).map_err(|error| error.to_string())
}

/// Путь файла состояния рабочего места в служебном каталоге.
fn workspace_path(root: &Path) -> PathBuf {
    root.join(WORKSPACE_FILE_NAME)
}

#[cfg(test)]
#[path = "workspace_state_tests.rs"]
mod tests;
