//! Реестр активности плагинов.
//!
//! Хранит множество отключённых имён плагинов в служебном каталоге состояния
//! приложения. Ядро применяет реестр при загрузке плагинов, а стор меняет его
//! через привилегированные host-функции.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Имя файла реестра в служебном каталоге состояния.
const FILE_NAME: &str = "disabled-plugins.json";

/// Содержимое файла реестра.
#[derive(Debug, Default, Serialize, Deserialize)]
struct ActivationFile {
    /// Имена отключённых плагинов.
    #[serde(default)]
    disabled: Vec<String>,
}

/// Загрузка множества отключённых плагинов.
pub fn load(root: &Path) -> Result<Vec<String>, String> {
    match std::fs::read_to_string(file_path(root)) {
        Ok(value) => {
            let file: ActivationFile =
                serde_json::from_str(&value).map_err(|error| error.to_string())?;
            Ok(file.disabled)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(error) => Err(error.to_string()),
    }
}

/// Признак, что плагин отключён.
pub fn is_disabled(root: &Path, name: &str) -> Result<bool, String> {
    Ok(load(root)?.iter().any(|current| current == name))
}

/// Установка активности плагина: `enabled = true` включает, `false` отключает.
pub fn set_enabled(root: &Path, name: &str, enabled: bool) -> Result<(), String> {
    let mut disabled = load(root)?;
    disabled.retain(|current| current != name);
    if !enabled {
        disabled.push(name.to_string());
    }
    disabled.sort();
    disabled.dedup();
    save(root, &disabled)
}

/// Полная замена реестра отключённых (для инициализации и тестов).
pub fn save(root: &Path, disabled: &[String]) -> Result<(), String> {
    std::fs::create_dir_all(root).map_err(|error| error.to_string())?;
    let file = ActivationFile {
        disabled: disabled.to_vec(),
    };
    let value = serde_json::to_string(&file).map_err(|error| error.to_string())?;
    let path = file_path(root);
    let temporary = path.with_extension("tmp");
    std::fs::write(&temporary, value).map_err(|error| error.to_string())?;
    std::fs::rename(&temporary, &path).map_err(|error| error.to_string())
}

/// Путь файла реестра.
fn file_path(root: &Path) -> PathBuf {
    root.join(FILE_NAME)
}

#[cfg(test)]
#[path = "activation_tests.rs"]
mod tests;
