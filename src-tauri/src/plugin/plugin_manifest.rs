//! Манифест плагина.

use std::path::Path;

use serde::Deserialize;

use crate::plugin::plugin_kind::PluginKind;
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
    /// Категория плагина: базовый, source или extension.
    #[serde(default)]
    pub kind: PluginKind,
    /// Стабильный идентификатор плагина в формате UUID.
    pub id: String,
    /// Человекочитаемое название плагина для отображения.
    pub name: String,
    /// Краткое описание назначения плагина.
    pub description: String,
    /// Имя файла WASM-модуля плагина внутри папки плагина.
    ///
    /// Для плагина рабочего места поле необязательно: такой плагин может
    /// состоять только из модуля рисования.
    #[serde(default)]
    pub module: String,
    /// Имя экспортируемой функции, вызываемой в точке расширения.
    ///
    /// Для плагина рабочего места без WASM-модуля поле не используется.
    #[serde(default)]
    pub export: String,
    /// Форматы книг, которые обслуживает плагин рабочего места.
    ///
    /// Заполняется только плагинами рабочего места; ядро не интерпретирует
    /// сами значения, а лишь сопоставляет их с форматом файла книги.
    #[serde(default)]
    pub formats: Vec<String>,
    /// Относительный путь к модулю рисования содержимого.
    ///
    /// Заполняется только плагинами рабочего места. Ядро отдаёт файл
    /// приложению, не интерпретируя его содержимое.
    #[serde(default)]
    pub viewer: Option<String>,
    /// Имена host-функций, которые плагин может вызывать.
    pub host_functions: Vec<String>,
    /// Возможности, предоставляемые плагином.
    #[serde(default)]
    pub provides: Vec<String>,
    /// Возможности, требуемые плагином.
    #[serde(default)]
    pub requires: Vec<String>,
    /// Декларация секций настроек плагина.
    ///
    /// Содержимое не интерпретируется ядром и передаётся базовому плагину
    /// настроек как opaque-схема.
    #[serde(default)]
    pub settings: Option<serde_json::Value>,
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
        if uuid::Uuid::parse_str(&self.id).is_err() {
            return Err(PluginError::InvalidManifest {
                dir: dir.to_path_buf(),
                reason: format!("идентификатор плагина не является UUID: {}", self.id),
            });
        }
        if self.kind == PluginKind::Workplace {
            self.validate_workplace(dir)?;
        } else {
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

    /// Проверка манифеста плагина рабочего места.
    ///
    /// Такой плагин обязан объявить хотя бы один формат и безопасный
    /// относительный путь к модулю рисования; WASM-модуль необязателен, но
    /// если он указан, то у него должно быть имя экспортируемой функции.
    fn validate_workplace(&self, dir: &Path) -> Result<(), PluginError> {
        if self.formats.iter().all(|format| format.trim().is_empty()) {
            return Err(PluginError::InvalidManifest {
                dir: dir.to_path_buf(),
                reason: "плагин рабочего места не объявил ни одного формата".to_string(),
            });
        }
        if self.formats.iter().any(|format| format.trim().is_empty()) {
            return Err(PluginError::InvalidManifest {
                dir: dir.to_path_buf(),
                reason: "формат плагина рабочего места не может быть пустым".to_string(),
            });
        }
        let viewer = self
            .viewer
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| PluginError::InvalidManifest {
                dir: dir.to_path_buf(),
                reason: "плагин рабочего места не указал модуль рисования".to_string(),
            })?;
        if !is_safe_relative_path(viewer) {
            return Err(PluginError::InvalidManifest {
                dir: dir.to_path_buf(),
                reason: format!("некорректный путь модуля рисования: {viewer}"),
            });
        }
        if !self.module.trim().is_empty() && self.export.trim().is_empty() {
            return Err(PluginError::InvalidManifest {
                dir: dir.to_path_buf(),
                reason: "у WASM-модуля плагина рабочего места не указана экспортируемая функция"
                    .to_string(),
            });
        }
        Ok(())
    }
}

/// Проверка, что путь относительный и не выходит за каталог плагина.
pub(crate) fn is_safe_relative_path(value: &str) -> bool {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return false;
    }
    let path = std::path::Path::new(trimmed);
    !path.is_absolute()
        && !path
            .components()
            .any(|component| !matches!(component, std::path::Component::Normal(_)))
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
