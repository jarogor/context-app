//! Реестр активности плагинов.
//!
//! Хранит множество отключённых идентификаторов плагинов в служебном каталоге
//! состояния приложения. Ядро применяет реестр при загрузке плагинов, а стор
//! меняет его через привилегированные host-функции.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::atomic_file;

/// Имя файла реестра в служебном каталоге состояния.
const FILE_NAME: &str = "disabled-plugins.json";

/// Содержимое файла реестра.
#[derive(Debug, Default, Serialize, Deserialize)]
struct ActivationFile {
    /// Идентификаторы отключённых плагинов.
    #[serde(default)]
    disabled: Vec<String>,
}

/// Загрузка множества отключённых плагинов.
pub fn load(root: &Path) -> Result<Vec<String>, String> {
    atomic_file::read_json_or_default::<ActivationFile>(&file_path(root))
        .map(|file| file.disabled)
        .map_err(|error| error.to_string())
}

/// Признак, что плагин с указанным идентификатором отключён.
pub fn is_disabled(root: &Path, id: &str) -> Result<bool, String> {
    Ok(load(root)?.iter().any(|current| current == id))
}

/// Установка активности плагина: `enabled = true` включает, `false` отключает.
pub fn set_enabled(root: &Path, id: &str, enabled: bool) -> Result<(), String> {
    let mut disabled = load(root)?;
    disabled.retain(|current| current != id);
    if !enabled {
        disabled.push(id.to_string());
    }
    disabled.sort();
    disabled.dedup();
    save(root, &disabled)
}

/// Полная замена реестра отключённых (для инициализации и тестов).
pub fn save(root: &Path, disabled: &[String]) -> Result<(), String> {
    let file = ActivationFile {
        disabled: disabled.to_vec(),
    };
    atomic_file::write_json(&file_path(root), &file).map_err(|error| error.to_string())
}

/// Путь файла реестра.
fn file_path(root: &Path) -> PathBuf {
    root.join(FILE_NAME)
}

#[cfg(test)]
#[path = "activation_tests.rs"]
mod tests;
