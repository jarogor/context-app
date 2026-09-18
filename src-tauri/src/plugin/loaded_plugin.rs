//! Загруженный плагин.

use extism::Plugin;

use crate::plugin::{PluginError, PluginKind};

/// Загруженный плагин, готовый к вызову.
pub struct LoadedPlugin {
    /// Имя плагина из манифеста.
    pub name: String,
    /// Тип плагина: расширение или поставщик источника.
    pub kind: PluginKind,
    /// Возможности, предоставляемые плагином.
    pub provides: Vec<String>,
    /// Возможности, требуемые плагином.
    pub requires: Vec<String>,
    /// Имя экспортируемой функции.
    pub function: String,
    /// Инстанс плагина в Extism runtime.
    pub(super) plugin: Plugin,
}

impl LoadedPlugin {
    /// Вызов экспортируемой функции плагина.
    pub fn invoke(&mut self, input: &str) -> Result<String, PluginError> {
        let output: String = self
            .plugin
            .call::<&str, String>(&self.function, input)
            .map_err(|e| PluginError::Call {
                plugin: self.name.clone(),
                message: e.to_string(),
            })?;
        Ok(output)
    }
}
