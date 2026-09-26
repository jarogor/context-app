//! App-level runtime базовых плагинов каркаса.
//!
//! Базовые плагины (уведомления, настройки) загружаются один раз на уровне
//! всего приложения и не зависят от активной библиотеки. Runtime также
//! доставляет события из bus плагину, предоставляющему capability уведомлений.

use std::path::PathBuf;

use crate::plugin::contract::{CAPABILITY_NOTIFICATIONS, CAPABILITY_SETTINGS};
use crate::plugin::{get_bus, PluginError, PluginEvent, PluginKind, PluginRuntime};

/// Декларация собственной секции настроек приложения.
///
/// Схема передаётся базовому плагину настроек как opaque-декларация и не
/// интерпретируется ядром, кроме собственного ключа приложения.
const APP_SETTINGS_SCHEMA: &str = r#"{
  "title": "Приложение",
  "sections": [
    {
      "id": "general",
      "title": "Общие",
      "description": "Общие параметры приложения",
      "fields": [
        {
          "key": "startup.welcome_notification",
          "title": "Приветственное уведомление при запуске",
          "type": "boolean",
          "description": "Показывать приветствие при запуске приложения",
          "default": true
        }
      ]
    }
  ]
}"#;

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

    /// Установка корня пользовательского каталога плагинов для стора.
    pub fn set_plugin_store_root(&mut self, root: PathBuf) {
        self.runtime.set_plugin_store_root(root);
    }

    /// Установка корня реестра активности плагинов.
    pub fn set_activation_root(&mut self, root: PathBuf) {
        self.runtime.set_activation_root(root);
    }

    /// Установка директорий для перечня плагинов стора.
    pub fn set_catalog_dirs(&mut self, directories: Vec<PathBuf>) {
        self.runtime.set_catalog_dirs(directories);
    }

    /// Выполнение операции плагина, предоставляющего capability, без
    /// интерпретации payload ядром.
    pub fn invoke_capability(
        &mut self,
        capability: &str,
        operation: &str,
        payload: serde_json::Value,
    ) -> Result<String, PluginError> {
        self.runtime
            .invoke_capability(capability, operation, payload)
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

    /// Перерегистрация реестра настроек в базовом плагине настроек.
    ///
    /// Собирает декларации базовых плагинов, дополнительные декларации сессии
    /// и собственную секцию приложения. При отсутствии провайдера capability
    /// настроек выходит без ошибки, не нарушая работу остальных плагинов.
    pub fn refresh_settings_registry(
        &mut self,
        session_sources: &[serde_json::Value],
    ) -> Result<(), PluginError> {
        if self.runtime.plugin_providing(CAPABILITY_SETTINGS).is_none() {
            return Ok(());
        }
        let mut sources = self.runtime.settings_sources();
        sources.extend(session_sources.iter().cloned());
        let app_schema: serde_json::Value =
            serde_json::from_str(APP_SETTINGS_SCHEMA).map_err(|error| PluginError::Call {
                plugin: "runtime".to_string(),
                message: format!("некорректная схема настроек приложения: {error}"),
            })?;
        sources.push(serde_json::json!({
            "owner": "app",
            "kind": "app",
            "schema": app_schema,
        }));
        self.runtime.invoke_capability(
            CAPABILITY_SETTINGS,
            "register",
            serde_json::json!({ "sources": sources }),
        )?;
        Ok(())
    }

    /// Сброс журнала уведомлений при старте сессии приложения.
    ///
    /// Вызывает opaque-операцию `clear` у провайдера capability уведомлений,
    /// чтобы журнал жил только в пределах текущего запуска. При отсутствии
    /// провайдера вызов безвреден.
    pub fn reset_notifications(&mut self) -> Result<(), PluginError> {
        if self
            .runtime
            .plugin_providing(CAPABILITY_NOTIFICATIONS)
            .is_none()
        {
            return Ok(());
        }
        self.runtime
            .invoke_capability(CAPABILITY_NOTIFICATIONS, "clear", serde_json::json!({}))?;
        Ok(())
    }

    /// Признак необходимости приветственного уведомления при старте.
    ///
    /// Значение читается из собственной секции настроек приложения; при
    /// отсутствии провайдера или значения используется значение по умолчанию
    /// `true`.
    pub fn welcome_notification_enabled(&mut self) -> bool {
        let Ok(response) = self.runtime.invoke_capability(
            CAPABILITY_SETTINGS,
            "get",
            serde_json::json!({ "section": "app.general" }),
        ) else {
            return true;
        };
        serde_json::from_str::<serde_json::Value>(&response)
            .ok()
            .and_then(|value| value["values"]["startup.welcome_notification"].as_bool())
            .unwrap_or(true)
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
