//! Реестр рабочих мест.
//!
//! Хранит список рабочих мест и активное рабочее место в служебном каталоге
//! приложения. Ядро не интерпретирует содержимое вкладок: книгу, позицию и
//! масштаб ведёт оболочка, а здесь сохраняется непрозрачный для ядра снимок.
//! Прежнее одиночное состояние (`workspace.json`) переносится в рабочее место по
//! умолчанию при первом чтении реестра.

use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};

use crate::atomic_file;

/// Имя файла реестра рабочих мест в служебном каталоге.
const WORKSPACES_FILE_NAME: &str = "workspaces.json";

/// Имя прежнего файла одиночного состояния для переноса.
const LEGACY_WORKSPACE_FILE_NAME: &str = "workspace.json";

/// Идентификатор рабочего места по умолчанию при переносе прежнего состояния.
const DEFAULT_WORKSPACE_ID: &str = "default";

/// Имя рабочего места по умолчанию при переносе прежнего состояния.
const DEFAULT_WORKSPACE_NAME: &str = "Рабочее место";

/// Вкладка рабочего места.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WorkspaceTab {
    /// Идентификатор экземпляра вкладки.
    pub id: String,
    /// Путь к файлу книги (вложение вкладки).
    #[serde(default, alias = "book_id")]
    pub path: String,
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
    /// Пользовательское имя вкладки; отсутствует, если не задано.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Пользовательское описание вкладки; отсутствует, если не задано.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Иконка оформления вкладки; отсутствует, если не задана.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    /// Цвет оформления вкладки; отсутствует, если не задан.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

/// Рабочее место: именованная композиция вкладок.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WorkspaceRecord {
    /// Идентификатор рабочего места.
    pub id: String,
    /// Человекочитаемое имя рабочего места.
    pub name: String,
    /// Время создания (Unix, мс).
    #[serde(default)]
    pub created_at_millis: u64,
    /// Вкладки рабочего места в порядке отображения.
    #[serde(default)]
    pub tabs: Vec<WorkspaceTab>,
    /// Идентификатор активной вкладки.
    #[serde(default)]
    pub active_tab_id: Option<String>,
}

/// Реестр рабочих мест.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct WorkspacesFile {
    /// Рабочие места в порядке отображения.
    #[serde(default)]
    pub workspaces: Vec<WorkspaceRecord>,
    /// Идентификатор активного рабочего места.
    #[serde(default)]
    pub active_workspace_id: Option<String>,
}

/// Прежнее одиночное состояние рабочего места для переноса.
#[derive(Debug, Default, Deserialize)]
struct LegacyWorkspaceState {
    /// Вкладки прежнего рабочего места.
    #[serde(default)]
    tabs: Vec<WorkspaceTab>,
    /// Идентификатор активной вкладки прежнего рабочего места.
    #[serde(default)]
    active_tab_id: Option<String>,
}

/// Значение масштаба по умолчанию.
fn default_zoom() -> u32 {
    100
}

/// Загрузка реестра рабочих мест.
///
/// Порядок чтения: реестр `workspaces.json`; при его отсутствии — перенос
/// прежнего `workspace.json` в рабочее место по умолчанию; иначе — пустой реестр.
pub fn load(root: &Path) -> Result<WorkspacesFile, String> {
    match atomic_file::read_json::<WorkspacesFile>(&workspaces_path(root)) {
        Ok(file) => Ok(file),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(migrate_legacy(root)),
        Err(error) => Err(error.to_string()),
    }
}

/// Сохранение реестра рабочих мест атомарной записью.
pub fn save(root: &Path, file: &WorkspacesFile) -> Result<(), String> {
    atomic_file::write_json(&workspaces_path(root), file).map_err(|error| error.to_string())
}

/// Перенос прежнего одиночного состояния в рабочее место по умолчанию.
///
/// Чтение идемпотентно: пока реестр не сохранён, каждый вызов даёт то же
/// детерминированное рабочее место, а прежний файл не изменяется и не удаляется.
fn migrate_legacy(root: &Path) -> WorkspacesFile {
    let legacy_path = legacy_workspace_path(root);
    let legacy: LegacyWorkspaceState = match std::fs::read_to_string(&legacy_path) {
        Ok(value) => serde_json::from_str(&value).unwrap_or_default(),
        Err(_) => LegacyWorkspaceState::default(),
    };
    if legacy.tabs.is_empty() {
        return WorkspacesFile::default();
    }
    WorkspacesFile {
        workspaces: vec![WorkspaceRecord {
            id: DEFAULT_WORKSPACE_ID.to_string(),
            name: DEFAULT_WORKSPACE_NAME.to_string(),
            // Время берётся из mtime прежнего файла, а не из текущего момента:
            // иначе повторное чтение до сохранения давало бы новое время и
            // миграция переставала быть идемпотентной.
            created_at_millis: legacy_modified_millis(&legacy_path),
            tabs: legacy.tabs,
            active_tab_id: legacy.active_tab_id,
        }],
        active_workspace_id: Some(DEFAULT_WORKSPACE_ID.to_string()),
    }
}

/// Время изменения прежнего файла одиночного состояния (Unix, мс).
fn legacy_modified_millis(path: &Path) -> u64 {
    std::fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

/// Путь файла реестра в служебном каталоге состояния.
fn workspaces_path(root: &Path) -> PathBuf {
    root.join(WORKSPACES_FILE_NAME)
}

/// Путь прежнего файла одиночного состояния.
fn legacy_workspace_path(root: &Path) -> PathBuf {
    root.join(LEGACY_WORKSPACE_FILE_NAME)
}

#[cfg(test)]
#[path = "workspace_state_tests.rs"]
mod tests;
