//! Манифест плагина.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::plugin::PluginError;

use super::contract::CONTRACT_VERSION;

/// Тип плагина: расширение или поставщик внешнего источника книг.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum PluginKind {
    /// Обычное расширение приложения.
    #[default]
    Extension,
    /// Поставщик внешнего источника книг с host-функциями файловой системы.
    Source,
}

impl PluginKind {
    /// Строковое представление типа плагина для контракта.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Extension => "extension",
            Self::Source => "source",
        }
    }
}

/// Манифест плагина в формате `plugin-manifest.json`.
///
/// Лежит в корне папки плагина и описывает, как приложение
/// должно загрузить модуль плагина.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct PluginManifest {
    /// Версия контракта, которой соответствует плагин.
    pub contract_version: u32,
    /// Тип плагина: расширение или поставщик источника.
    #[serde(default)]
    pub kind: PluginKind,
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
    /// Возможности, предоставляемые плагином.
    #[serde(default)]
    pub provides: Vec<String>,
    /// Возможности, требуемые плагином.
    #[serde(default)]
    pub requires: Vec<String>,
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
        for capability in self.provides.iter().chain(self.requires.iter()) {
            if !is_valid_capability(capability) {
                return Err(PluginError::InvalidManifest {
                    dir: dir.to_path_buf(),
                    reason: format!("некорректная capability: {capability}"),
                });
            }
        }
        Ok(())
    }
}

/// Проверка имени capability в формате `имя@версия`.
fn is_valid_capability(value: &str) -> bool {
    let Some((name, version)) = value.rsplit_once('@') else {
        return false;
    };
    !name.trim().is_empty() && version.parse::<u32>().is_ok()
}

#[cfg(test)]
#[path = "plugin_manifest_tests.rs"]
mod tests;
