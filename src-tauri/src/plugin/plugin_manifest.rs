//! Манифест плагина.

use std::path::Path;

use serde::Deserialize;

use crate::plugin::plugin_kind::PluginKind;
use crate::plugin::plugin_level::PluginLevel;
use crate::plugin::plugin_scope::PluginScope;
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
    /// Уровень плагина: каркас или приложение.
    #[serde(default)]
    pub level: PluginLevel,
    /// Назначение плагина: его предметная роль в приложении.
    #[serde(default)]
    pub kind: PluginKind,
    /// Область загрузки плагина: приложение, сессия библиотеки или книга.
    ///
    /// Если поле не указано, область выводится из уровня и назначения
    /// ([`PluginManifest::scope`]).
    #[serde(default)]
    pub scope: Option<PluginScope>,
    /// Стабильный идентификатор плагина в формате UUID.
    pub id: String,
    /// Человекочитаемое название плагина для отображения.
    pub name: String,
    /// Краткое описание назначения плагина.
    pub description: String,
    /// Имя файла WASM-модуля плагина внутри папки плагина.
    ///
    /// Для плагина формата чтения поле необязательно: такой плагин может
    /// состоять только из модуля рисования.
    #[serde(default)]
    pub module: String,
    /// Имя экспортируемой функции, вызываемой в точке расширения.
    ///
    /// Для плагина формата без WASM-модуля поле не используется.
    #[serde(default)]
    pub export: String,
    /// Форматы книг, которые обслуживает плагин формата чтения.
    ///
    /// Заполняется только плагинами формата; ядро не интерпретирует
    /// сами значения, а лишь сопоставляет их с форматом файла книги.
    #[serde(default)]
    pub formats: Vec<String>,
    /// Относительный путь к модулю рисования содержимого.
    ///
    /// Заполняется только плагинами формата. Ядро отдаёт файл
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
    /// Признак образца для разработчика.
    ///
    /// Образцы поставляются как примеры структуры плагина и не решают задач
    /// пользователя: интерфейс показывает их отдельной группой в конце.
    #[serde(default)]
    pub sample: bool,
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

    /// Область загрузки плагина с учётом уровня и назначения.
    ///
    /// Объявленное значение имеет приоритет; при его отсутствии область
    /// выводится по признакам: каркасный плагин и плагин заметок грузятся на
    /// уровне приложения, плагин формата — при открытии книги, остальные — в
    /// сессии библиотеки.
    pub fn scope(&self) -> PluginScope {
        if let Some(scope) = self.scope {
            return scope;
        }
        if self.level.is_framework() || self.kind == PluginKind::Notes {
            return PluginScope::Application;
        }
        if self.kind == PluginKind::Format {
            return PluginScope::Book;
        }
        PluginScope::Session
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
        if self.kind == PluginKind::Format {
            self.validate_format(dir)?;
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
        for function in &self.host_functions {
            if !crate::plugin::contract::is_known_host_function(function) {
                return Err(PluginError::InvalidManifest {
                    dir: dir.to_path_buf(),
                    reason: format!("неизвестное право (host-функция): {function}"),
                });
            }
        }
        Ok(())
    }

    /// Проверка манифеста плагина формата чтения.
    ///
    /// Такой плагин обязан объявить хотя бы один формат и безопасный
    /// относительный путь к модулю рисования; WASM-модуль необязателен, но
    /// если он указан, то у него должно быть имя экспортируемой функции.
    fn validate_format(&self, dir: &Path) -> Result<(), PluginError> {
        if self.formats.iter().all(|format| format.trim().is_empty()) {
            return Err(PluginError::InvalidManifest {
                dir: dir.to_path_buf(),
                reason: "плагин формата не объявил ни одного формата".to_string(),
            });
        }
        if self.formats.iter().any(|format| format.trim().is_empty()) {
            return Err(PluginError::InvalidManifest {
                dir: dir.to_path_buf(),
                reason: "формат плагина не может быть пустым".to_string(),
            });
        }
        let viewer = self
            .viewer
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| PluginError::InvalidManifest {
                dir: dir.to_path_buf(),
                reason: "плагин формата не указал модуль рисования".to_string(),
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
                reason: "у WASM-модуля плагина формата не указана экспортируемая функция"
                    .to_string(),
            });
        }
        Ok(())
    }
}

/// Проверка, что путь относительный и не выходит за каталог плагина.
///
/// Служит общей проверкой безопасного относительного пути (модуль пакета,
/// файл модуля рисования, ключ storage) для ядра.
pub fn is_safe_relative_path(value: &str) -> bool {
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
