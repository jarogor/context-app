//! Обнаружение плагинов по манифестам без загрузки WASM.
//!
//! Используется для доступных провайдеров истории библиотек и для перечня
//! отключаемых плагинов: плагин определяется по манифесту в одной из директорий.

use std::path::{Path, PathBuf};

use serde::Serialize;

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

/// Запись перечня отключаемых плагинов.
#[derive(Debug, Clone, Serialize)]
pub struct PluginEntry {
    /// Имя плагина.
    pub name: String,
    /// Категория плагина.
    pub kind: String,
    /// Описание плагина.
    pub description: String,
    /// Включён ли плагин.
    pub enabled: bool,
    /// Можно ли удалить плагин (найден в пользовательском каталоге).
    pub removable: bool,
}

/// Перечень отключаемых плагинов из указанных директорий.
///
/// Базовые плагины каркаса исключаются. `enabled` вычисляется по списку
/// отключённых, `removable` — по наличию плагина в пользовательском каталоге.
pub fn list_disableable(
    directories: &[PathBuf],
    user_root: Option<&Path>,
    disabled: &[String],
) -> Vec<PluginEntry> {
    let mut entries: Vec<PluginEntry> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for directory in directories {
        let Ok(dir_entries) = std::fs::read_dir(directory) else {
            continue;
        };
        for entry in dir_entries.flatten() {
            if !entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false) {
                continue;
            }
            let plugin_dir = entry.path();
            let Ok(manifest) = PluginManifest::load(&plugin_dir.join(MANIFEST_FILE_NAME)) else {
                continue;
            };
            if manifest.kind == PluginKind::Base || !seen.insert(manifest.name.clone()) {
                continue;
            }
            let removable = user_root
                .map(|root| root.join(&manifest.name).is_dir())
                .unwrap_or(false);
            entries.push(PluginEntry {
                name: manifest.name.clone(),
                kind: kind_name(manifest.kind),
                description: manifest.description.clone(),
                enabled: !disabled.iter().any(|name| name == &manifest.name),
                removable,
            });
        }
    }
    entries.sort_by(|left, right| left.name.cmp(&right.name));
    entries
}

/// Признак, что в директориях есть отключаемый плагин с указанным именем.
pub fn is_disableable(directories: &[PathBuf], name: &str) -> bool {
    list_disableable(directories, None, &[])
        .iter()
        .any(|entry| entry.name == name)
}

/// Строковое имя категории плагина.
fn kind_name(kind: PluginKind) -> String {
    serde_json::to_value(kind)
        .ok()
        .and_then(|value| value.as_str().map(str::to_string))
        .unwrap_or_default()
}

#[cfg(test)]
#[path = "discovery_tests.rs"]
mod tests;
