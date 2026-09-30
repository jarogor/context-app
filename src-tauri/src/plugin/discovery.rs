//! Обнаружение плагинов по манифестам без загрузки WASM.
//!
//! Используется для доступных провайдеров истории библиотек и для перечня
//! отключаемых плагинов: плагин определяется по манифесту в одной из директорий.

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::plugin::contract::MANIFEST_FILE_NAME;
use crate::plugin::{PluginKind, PluginManifest};

/// Доступный source-плагин, обнаруженный по манифесту.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SourceProvider {
    /// Стабильный идентификатор плагина.
    pub id: String,
    /// Человекочитаемое имя плагина.
    pub name: String,
}

/// Доступные source-плагины из указанных директорий.
///
/// Некорректные и отсутствующие манифесты пропускаются; плагины дедуплицируются
/// по идентификатору и сортируются по идентификатору.
pub fn discover_source_plugins(directories: &[PathBuf]) -> Vec<SourceProvider> {
    let mut providers: Vec<SourceProvider> = Vec::new();
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
            if manifest.kind != PluginKind::Source
                || providers.iter().any(|provider| provider.id == manifest.id)
            {
                continue;
            }
            providers.push(SourceProvider {
                id: manifest.id,
                name: manifest.name,
            });
        }
    }
    providers.sort_by(|left, right| left.id.cmp(&right.id));
    providers
}

/// Запись перечня отключаемых плагинов.
#[derive(Debug, Clone, Serialize)]
pub struct PluginEntry {
    /// Идентификатор плагина.
    pub id: String,
    /// Человекочитаемое имя плагина.
    pub name: String,
    /// Категория плагина.
    pub kind: String,
    /// Описание плагина.
    pub description: String,
    /// Включён ли плагин.
    pub enabled: bool,
    /// Можно ли удалить плагин (найден в пользовательском каталоге).
    pub removable: bool,
    /// Является ли плагин образцом для разработчика.
    pub sample: bool,
}

/// Перечень отключаемых плагинов из указанных директорий.
///
/// Базовые плагины каркаса исключаются. `enabled` вычисляется по списку
/// отключённых идентификаторов, `removable` — по расположению плагина в
/// пользовательском каталоге.
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
            if manifest.kind == PluginKind::Base || !seen.insert(manifest.id.clone()) {
                continue;
            }
            let removable = user_root
                .map(|root| plugin_dir.starts_with(root))
                .unwrap_or(false);
            entries.push(PluginEntry {
                id: manifest.id.clone(),
                name: manifest.name.clone(),
                kind: kind_name(manifest.kind),
                description: manifest.description.clone(),
                enabled: !disabled.iter().any(|id| id == &manifest.id),
                removable,
                sample: manifest.sample,
            });
        }
    }
    entries.sort_by(|left, right| left.id.cmp(&right.id));
    entries
}

/// Признак, что в директориях есть отключаемый плагин с указанным идентификатором.
pub fn is_disableable(directories: &[PathBuf], id: &str) -> bool {
    list_disableable(directories, None, &[])
        .iter()
        .any(|entry| entry.id == id)
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
