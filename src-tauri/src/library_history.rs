//! История открытых библиотек.
//!
//! Реестр принадлежит ядру: запись хранит путь и провайдера (идентификатор
//! source-плагина). В выдачу попадают только записи доступных и включённых
//! провайдеров; недоступные сохраняются, но скрываются.

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::plugin::SourceProvider;

/// Имя файла истории в служебном каталоге состояния.
const HISTORY_FILE_NAME: &str = "library-history.json";

/// Сохранённая запись истории.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HistoryRecord {
    /// Путь библиотеки.
    pub path: String,
    /// Идентификатор source-плагина, которым открыта библиотека.
    pub provider: String,
    /// Время добавления записи (Unix, мс).
    pub added_at_millis: u64,
}

/// Содержимое файла истории.
#[derive(Debug, Default, Serialize, Deserialize)]
struct HistoryFile {
    /// Записи истории в порядке от новых к старым.
    #[serde(default)]
    entries: Vec<HistoryRecord>,
}

/// Запись истории в представлении для UI.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct HistoryEntry {
    /// Путь библиотеки.
    pub path: String,
    /// Идентификатор провайдера библиотеки.
    pub provider: String,
    /// Человекочитаемое имя провайдера.
    pub provider_name: String,
    /// Время открытия записи (Unix, мс).
    pub added_at_millis: u64,
    /// Существует ли директория библиотеки.
    pub available: bool,
}

/// Список истории, отфильтрованный по доступным и включённым провайдерам.
///
/// `available` — обнаруженные source-плагины; `disabled` — отключённые
/// идентификаторы. Записи отключённых или отсутствующих провайдеров
/// сохраняются, но не выдаются.
pub fn list(
    root: &Path,
    available: &[SourceProvider],
    disabled: &[String],
) -> Result<Vec<HistoryEntry>, String> {
    let file = load(root)?;
    Ok(file
        .entries
        .into_iter()
        .filter_map(|record| {
            let provider = available.iter().find(|item| item.id == record.provider)?;
            if disabled.iter().any(|id| id == &record.provider) {
                return None;
            }
            Some(HistoryEntry {
                available: Path::new(&record.path).is_dir(),
                path: record.path,
                provider: record.provider,
                provider_name: provider.name.clone(),
                added_at_millis: record.added_at_millis,
            })
        })
        .collect())
}

/// Запоминание открытой библиотеки: перемещение наверх без дублирования.
pub fn remember(root: &Path, path: &str, provider: &str) -> Result<(), String> {
    let mut file = load(root)?;
    file.entries.retain(|record| record.path != path);
    file.entries.insert(
        0,
        HistoryRecord {
            path: path.to_string(),
            provider: provider.to_string(),
            added_at_millis: now_millis(),
        },
    );
    save(root, &file)
}

/// Удаление записи истории по пути библиотеки.
pub fn forget(root: &Path, path: &str) -> Result<(), String> {
    let mut file = load(root)?;
    file.entries.retain(|record| record.path != path);
    save(root, &file)
}

/// Путь файла истории в служебном каталоге состояния.
fn history_path(root: &Path) -> PathBuf {
    root.join(HISTORY_FILE_NAME)
}

/// Загрузка истории; отсутствующий файл — пустая история.
fn load(root: &Path) -> Result<HistoryFile, String> {
    match std::fs::read_to_string(history_path(root)) {
        Ok(value) => serde_json::from_str(&value).map_err(|error| error.to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(HistoryFile::default()),
        Err(error) => Err(error.to_string()),
    }
}

/// Атомарная запись истории.
fn save(root: &Path, file: &HistoryFile) -> Result<(), String> {
    std::fs::create_dir_all(root).map_err(|error| error.to_string())?;
    let value = serde_json::to_string(file).map_err(|error| error.to_string())?;
    let path = history_path(root);
    let temporary = path.with_extension("tmp");
    std::fs::write(&temporary, value).map_err(|error| error.to_string())?;
    std::fs::rename(&temporary, &path).map_err(|error| error.to_string())
}

/// Текущее время Unix в миллисекундах.
fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

#[cfg(test)]
#[path = "library_history_tests.rs"]
mod tests;
