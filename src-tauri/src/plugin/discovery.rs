//! Обнаружение source-плагинов по манифестам без загрузки WASM.
//!
//! Используется для определения доступных провайдеров истории библиотек:
//! плагин считается доступным, если его манифест присутствует в одной из
//! директорий плагинов и объявляет категорию `source`.

use std::path::{Path, PathBuf};

use crate::plugin::contract::MANIFEST_FILE_NAME;
use crate::plugin::{PluginKind, PluginManifest};

/// Имена доступных source-плагинов из указанных директорий.
///
/// Некорректные и отсутствующие манифесты пропускаются; имена сортируются и
/// дедуплицируются.
pub fn discover_source_plugins(directories: &[PathBuf]) -> Vec<String> {
    let mut names = Vec::new();
    for directory in directories {
        let Ok(entries) = std::fs::read_dir(directory) else {
            continue;
        };
        for entry in entries.flatten() {
            if !entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false) {
                continue;
            }
            let manifest_path = entry.path().join(MANIFEST_FILE_NAME);
            let Ok(manifest) = PluginManifest::load(&manifest_path) else {
                continue;
            };
            if manifest.kind == PluginKind::Source && !names.contains(&manifest.name) {
                names.push(manifest.name);
            }
        }
    }
    names.sort();
    names
}

/// Проверка, что директория содержит source-плагин с указанным именем.
pub fn contains_source_plugin(directory: &Path, name: &str) -> bool {
    discover_source_plugins(&[directory.to_path_buf()])
        .iter()
        .any(|plugin| plugin == name)
}

#[cfg(test)]
#[path = "discovery_tests.rs"]
mod tests;
