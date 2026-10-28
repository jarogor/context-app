//! Обнаружение плагинов по манифестам без загрузки WASM.
//!
//! Используется для доступных провайдеров истории библиотек и для перечня
//! отключаемых плагинов: плагин определяется по манифесту в одной из директорий.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::plugin::contract::MANIFEST_FILE_NAME;
use crate::plugin::PluginKind;
use crate::plugin::PluginManifest;

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
    let mut seen: HashSet<String> = HashSet::new();
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
            if manifest.kind != PluginKind::Books || !seen.insert(manifest.id.clone()) {
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
    /// Версия плагина.
    pub version: String,
    /// Уровень плагина: каркас или приложение.
    pub level: String,
    /// Назначение плагина: его предметная роль.
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
/// Каркасные плагины исключаются. `enabled` вычисляется по списку
/// отключённых идентификаторов, `removable` — по расположению плагина в
/// пользовательском каталоге. При нескольких копиях одного идентификатора
/// (директории идут в порядке приоритета) запись берётся из первой, но признак
/// образца `sample` поднимается, если он есть в любой из копий.
pub fn list_disableable(
    directories: &[PathBuf],
    user_root: Option<&Path>,
    disabled: &[String],
) -> Vec<PluginEntry> {
    let mut entries: Vec<PluginEntry> = Vec::new();
    let mut index_by_id: HashMap<String, usize> = HashMap::new();
    let disabled: HashSet<&str> = disabled.iter().map(String::as_str).collect();
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
            if manifest.level.is_framework() {
                continue;
            }
            // Признак образца — свойство плагина, а не конкретной его копии:
            // пользовательская копия того же идентификатора не должна лишать
            // поставляемый образец отметки.
            if let Some(&index) = index_by_id.get(&manifest.id) {
                if manifest.sample {
                    entries[index].sample = true;
                }
                continue;
            }
            let removable = user_root
                .map(|root| plugin_dir.starts_with(root))
                .unwrap_or(false);
            index_by_id.insert(manifest.id.clone(), entries.len());
            entries.push(PluginEntry {
                id: manifest.id.clone(),
                name: manifest.name.clone(),
                version: manifest.version_or_zero(),
                level: manifest.level.to_string(),
                kind: manifest.kind.to_string(),
                description: manifest.description.clone(),
                enabled: !disabled.contains(manifest.id.as_str()),
                removable,
                sample: manifest.sample,
            });
        }
    }
    entries.sort_by(|left, right| left.id.cmp(&right.id));
    entries
}

/// Признак, что в директориях есть отключаемый плагин с указанным идентификатором.
///
/// Сканирование прекращается на первом совпадении: полный перечень отключаемых
/// плагинов для проверки существования не строится.
pub fn is_disableable(directories: &[PathBuf], id: &str) -> bool {
    for directory in directories {
        let Ok(dir_entries) = std::fs::read_dir(directory) else {
            continue;
        };
        for entry in dir_entries.flatten() {
            if !entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false) {
                continue;
            }
            let Ok(manifest) = PluginManifest::load(&entry.path().join(MANIFEST_FILE_NAME)) else {
                continue;
            };
            if !manifest.level.is_framework() && manifest.id == id {
                return true;
            }
        }
    }
    false
}

#[cfg(test)]
#[path = "discovery_tests.rs"]
mod tests;
