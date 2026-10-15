//! Загруженный плагин.

use std::path::PathBuf;

use extism::Plugin;

use crate::plugin::{PluginError, PluginKind, PluginLevel, PluginScope};

/// Загруженный плагин, готовый к вызову.
pub struct LoadedPlugin {
    /// Стабильный идентификатор плагина из манифеста.
    pub id: String,
    /// Человекочитаемое имя плагина из манифеста.
    pub name: String,
    /// Уровень плагина из манифеста: каркас или приложение.
    pub level: PluginLevel,
    /// Назначение плагина из манифеста.
    pub kind: PluginKind,
    /// Область загрузки плагина.
    pub scope: PluginScope,
    /// Возможности, предоставляемые плагином.
    pub provides: Vec<String>,
    /// Возможности, требуемые плагином.
    pub requires: Vec<String>,
    /// Декларация секций настроек плагина (opaque-схема).
    pub settings: Option<serde_json::Value>,
    /// Имя экспортируемой функции.
    pub function: String,
    /// Форматы книг, обслуживаемые плагином формата.
    pub formats: Vec<String>,
    /// Относительный путь к модулю рисования плагина формата.
    pub viewer: Option<String>,
    /// Директория, из которой загружен плагин.
    pub dir: PathBuf,
    /// Инстанс плагина в Extism runtime; `None`, если WASM-модуль отсутствует.
    pub(super) plugin: Option<Plugin>,
}

impl LoadedPlugin {
    /// Вызов экспортируемой функции плагина.
    pub fn invoke(&mut self, input: &str) -> Result<String, PluginError> {
        let Some(plugin) = self.plugin.as_mut() else {
            return Err(PluginError::Call {
                plugin: self.name.clone(),
                message: "плагин формата не предоставляет WASM-модуль".to_string(),
            });
        };
        let output: String = plugin
            .call::<&str, String>(&self.function, input)
            .map_err(|e| PluginError::Call {
                plugin: self.name.clone(),
                message: e.to_string(),
            })?;
        Ok(output)
    }

    /// Поддерживает ли плагин указанный формат книги.
    pub fn supports_format(&self, format: &str) -> bool {
        let format = format.trim().to_ascii_lowercase();
        !format.is_empty()
            && self
                .formats
                .iter()
                .any(|value| value.trim().eq_ignore_ascii_case(&format))
    }
}
