//! App-level runtime базовых плагинов каркаса.
//!
//! Базовые плагины (уведомления, настройки) загружаются один раз на уровне
//! всего приложения и не зависят от активной библиотеки. Runtime также
//! доставляет события из bus плагину, предоставляющему capability уведомлений.

use std::path::PathBuf;

use crate::plugin::contract::CAPABILITY_NOTIFICATIONS;
use crate::plugin::{get_bus, PluginError, PluginEvent, PluginKind, PluginRuntime};

/// App-level runtime базовых плагинов.
pub struct AppPluginHost {
    /// Runtime загруженных базовых плагинов.
    runtime: PluginRuntime,
    /// Корень служебного хранилища базовых плагинов.
    storage_root: PathBuf,
}

impl AppPluginHost {
    /// Создание runtime базовых плагинов из указанных директорий.
    ///
    /// `storage_root` — корень служебного хранилища базовых плагинов.
    pub fn load(
        directories: &[PathBuf],
        storage_root: impl Into<PathBuf>,
    ) -> Result<Self, PluginError> {
        let storage_root = storage_root.into();
        let mut runtime =
            PluginRuntime::load_kinds(directories, PathBuf::from("."), Some(&[PluginKind::Base]))?;
        runtime.set_storage_root(storage_root.clone());
        Ok(Self {
            runtime,
            storage_root,
        })
    }

    /// Имена загруженных базовых плагинов.
    pub fn plugin_names(&self) -> Vec<String> {
        self.runtime.plugin_names()
    }

    /// Корень служебного хранилища базовых плагинов.
    pub fn storage_root(&self) -> &std::path::Path {
        &self.storage_root
    }

    /// Выполнение операции базового плагина без интерпретации payload ядром.
    pub fn invoke_operation(
        &mut self,
        plugin: &str,
        operation: &str,
        payload: serde_json::Value,
    ) -> Result<String, PluginError> {
        self.runtime.invoke_operation(plugin, operation, payload)
    }

    /// Доставка накопленных событий плагину, предоставляющему capability уведомлений.
    ///
    /// При отсутствии провайдера события отбрасываются без ошибки. События,
    /// порождённые во время доставки, остаются в bus до следующего вызова.
    pub fn drain_and_deliver(&mut self) -> Result<(), PluginError> {
        if self
            .runtime
            .plugin_providing(CAPABILITY_NOTIFICATIONS)
            .is_none()
        {
            get_bus().drain();
            return Ok(());
        }
        for event in get_bus().drain() {
            let payload = serde_json::to_value(&event).map_err(|error| PluginError::Call {
                plugin: "runtime".to_string(),
                message: format!("не удалось сериализовать событие: {error}"),
            })?;
            self.runtime
                .invoke_capability(CAPABILITY_NOTIFICATIONS, "publish", payload)?;
        }
        Ok(())
    }

    /// Публикация пользовательского события и его доставка плагину уведомлений.
    pub fn notify_user(
        &mut self,
        message: impl Into<String>,
        source: impl Into<String>,
        details: serde_json::Value,
    ) {
        self.publish_event("user", message.into(), source.into(), details);
    }

    /// Публикация технического события и его доставка плагину уведомлений.
    pub fn notify_technical(
        &mut self,
        message: impl Into<String>,
        source: impl Into<String>,
        details: serde_json::Value,
    ) {
        self.publish_event("technical", message.into(), source.into(), details);
    }

    /// Публикация события в bus с последующей доставкой.
    fn publish_event(
        &mut self,
        level: &str,
        message: String,
        source: String,
        details: serde_json::Value,
    ) {
        get_bus().publish(PluginEvent {
            level: level.to_string(),
            message,
            source,
            details,
        });
        let _ = self.drain_and_deliver();
    }
}

impl std::fmt::Debug for AppPluginHost {
    /// Форматирование runtime базовых плагинов для диагностики.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AppPluginHost")
            .field("plugins", &self.runtime.plugin_names())
            .field("storage_root", &self.storage_root)
            .finish()
    }
}

#[cfg(test)]
#[path = "app_host_tests.rs"]
mod tests;
