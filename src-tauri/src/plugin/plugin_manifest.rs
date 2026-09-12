//! Манифест плагина.

use std::path::Path;

use serde::Deserialize;

use crate::plugin::PluginError;

use super::contract::CONTRACT_VERSION;

/// Манифест плагина в формате `plugin-manifest.json`.
///
/// Лежит в корне папки плагина и описывает, как приложение
/// должно загрузить модуль плагина.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct PluginManifest {
    /// Версия контракта, которой соответствует плагин.
    pub contract_version: u32,
    /// Уникальное имя плагина.
    pub name: String,
    /// Краткое описание назначения плагина.
    pub description: String,
    /// Имя файла WASM-модуля плагина внутри папки плагина.
    pub module: String,
    /// Имя экспортируемой функции, вызываемой в точке расширения.
    pub export: String,
    /// Имена host-функций, которые плагин может вызывать.
    pub host_functions: Vec<String>,
}

impl PluginManifest {
    /// Загрузка и парсинг манифеста из файла.
    pub fn load(path: &Path) -> Result<Self, PluginError> {
        let content = std::fs::read(path).map_err(|e| PluginError::InvalidManifest {
            dir: path.to_path_buf(),
            reason: e.to_string(),
        })?;
        let manifest: PluginManifest =
            serde_json::from_slice(&content).map_err(|e| PluginError::InvalidManifest {
                dir: path.to_path_buf(),
                reason: e.to_string(),
            })?;
        Ok(manifest)
    }

    /// Проверка соответствия манифеста контракту приложения.
    ///
    /// `dir` — директория плагина, включается в текст ошибки.
    pub fn validate(&self, dir: &Path) -> Result<(), PluginError> {
        if self.contract_version != CONTRACT_VERSION {
            return Err(PluginError::UnsupportedContract {
                dir: dir.to_path_buf(),
                version: self.contract_version,
            });
        }
        if self.name.trim().is_empty() {
            return Err(PluginError::InvalidManifest {
                dir: dir.to_path_buf(),
                reason: "имя плагина не может быть пустым".to_string(),
            });
        }
        if self.module.trim().is_empty() {
            return Err(PluginError::InvalidManifest {
                dir: dir.to_path_buf(),
                reason: "модуль плагина не указан".to_string(),
            });
        }
        if self.export.trim().is_empty() {
            return Err(PluginError::InvalidManifest {
                dir: dir.to_path_buf(),
                reason: "имя экспортируемой функции не указано".to_string(),
            });
        }
        Ok(())
    }
}

#[cfg(test)]
#[path = "plugin_manifest_tests.rs"]
mod tests;
