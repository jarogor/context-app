//! App-level runtime базовых плагинов каркаса.
//!
//! Базовые плагины (уведомления, настройки) загружаются один раз на уровне
//! всего приложения и не зависят от активной библиотеки. Runtime также
//! доставляет события из bus плагину, предоставляющему capability уведомлений.

use std::path::{Path, PathBuf};

use crate::plugin::contract::{CAPABILITY_NOTIFICATIONS, CAPABILITY_SETTINGS};
use crate::plugin::{get_bus, set_log_level, PluginError, PluginKind, PluginRuntime, Severity};

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
        },
        {
          "key": "diagnostics.log_level",
          "title": "Порог технических логов",
          "type": "select",
          "description": "Минимальная степень серьёзности технических записей: чем подробнее, тем больше записей",
          "default": "info",
          "options": [
            { "value": "error", "title": "Только ошибки" },
            { "value": "warn", "title": "Предупреждения и ошибки" },
            { "value": "info", "title": "Информация и важнее" },
            { "value": "debug", "title": "Отладка и важнее" },
            { "value": "trace", "title": "Всё, включая трассу вызовов" }
          ]
        },
        {
          "key": "appearance.theme",
          "title": "Тема оформления",
          "type": "select",
          "description": "Светлая, тёмная или как в операционной системе",
          "default": "system",
          "options": [
            { "value": "light", "title": "Светлая" },
            { "value": "dark", "title": "Тёмная" },
            { "value": "system", "title": "Как в системе" }
          ]
        },
        {
          "key": "appearance.palette",
          "title": "Палитра оформления",
          "type": "select",
          "description": "Набор светлых и тёмных цветов интерфейса",
          "default": "gruvbox",
          "options": [
            { "value": "gruvbox", "title": "Gruvbox" },
            { "value": "mist", "title": "Mist" }
          ]
        },
        {
          "key": "reader.theme",
          "title": "Тема области чтения",
          "type": "select",
          "description": "Светлое или тёмное оформление поверхности книги; не связано с темой интерфейса",
          "default": "light",
          "options": [
            { "value": "light", "title": "Светлая" },
            { "value": "dark", "title": "Тёмная" }
          ]
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
    #[cfg(test)]
    pub fn load(
        directories: &[PathBuf],
        storage_root: impl Into<PathBuf>,
    ) -> Result<Self, PluginError> {
        Self::load_with_cache(directories, storage_root, None)
    }

    /// Создание runtime базовых плагинов с постоянным кэшем компиляции.
    ///
    /// `cache_config` — путь к конфигурации кэша wasmtime; `None` оставляет
    /// системный кэш по умолчанию.
    pub fn load_with_cache(
        directories: &[PathBuf],
        storage_root: impl Into<PathBuf>,
        cache_config: Option<&Path>,
    ) -> Result<Self, PluginError> {
        let storage_root = storage_root.into();
        let mut runtime = PluginRuntime::load_kinds(
            directories,
            PathBuf::from("."),
            Some(&[PluginKind::Base]),
            cache_config,
        )?;
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
            let payload = serde_json::to_value(&event).map_err(|error| {
                PluginError::runtime(format!("не удалось сериализовать событие: {error}"))
            })?;
            self.runtime
                .invoke_capability(CAPABILITY_NOTIFICATIONS, "publish", payload)?;
        }
        Ok(())
    }

    /// Публикация пользовательского события и его доставка плагину уведомлений.
    pub fn notify_user(
        &mut self,
        severity: Severity,
        message: impl Into<String>,
        source: impl Into<String>,
        details: serde_json::Value,
    ) {
        get_bus().publish_user(severity, message, source, details);
        let _ = self.drain_and_deliver();
    }

    /// Публикация технического события и его доставка плагину уведомлений.
    #[cfg(test)]
    pub fn notify_technical(
        &mut self,
        severity: Severity,
        message: impl Into<String>,
        source: impl Into<String>,
        details: serde_json::Value,
    ) {
        get_bus().publish_technical(severity, message, source, details);
        let _ = self.drain_and_deliver();
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
        let app_schema: serde_json::Value = match serde_json::from_str(APP_SETTINGS_SCHEMA) {
            Ok(schema) => schema,
            Err(error) => {
                get_bus().publish_technical(
                    Severity::Warn,
                    format!("Некорректная схема настроек приложения: {error}"),
                    "core",
                    serde_json::json!({}),
                );
                return Err(PluginError::runtime(format!(
                    "некорректная схема настроек приложения: {error}"
                )));
            }
        };
        sources.push(serde_json::json!({
            "owner": "app",
            "kind": "app",
            "schema": app_schema,
        }));
        if let Err(error) = self.runtime.invoke_capability(
            CAPABILITY_SETTINGS,
            "register",
            serde_json::json!({ "sources": sources }),
        ) {
            get_bus().publish_technical(
                Severity::Warn,
                format!("Не удалось обновить реестр настроек: {error}"),
                "core",
                serde_json::json!({}),
            );
            return Err(error);
        }
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
        self.app_setting_bool("startup.welcome_notification")
            .unwrap_or(true)
    }

    /// Порог логирования технических событий из настроек приложения.
    ///
    /// При отсутствии провайдера или значения используется `info`.
    pub fn log_level(&mut self) -> Severity {
        let Ok(response) = self.runtime.invoke_capability(
            CAPABILITY_SETTINGS,
            "get",
            serde_json::json!({ "section": "app.general" }),
        ) else {
            return Severity::Info;
        };
        serde_json::from_str::<serde_json::Value>(&response)
            .ok()
            .and_then(|value| {
                value["values"]["diagnostics.log_level"]
                    .as_str()
                    .map(str::to_string)
            })
            .and_then(|value| Severity::parse(&value))
            .unwrap_or(Severity::Info)
    }

    /// Пересчёт текущего порога логирования и его применение к шине событий.
    pub fn refresh_log_level(&mut self) {
        set_log_level(self.log_level());
    }

    /// Предпочтение темы оформления из настроек приложения.
    ///
    /// Значения `light`, `dark` и `system` возвращаются как есть; неизвестное
    /// или отсутствующее значение трактуется как `system`.
    pub fn theme_preference(&mut self) -> String {
        let value = self.app_setting_string("appearance.theme");
        match value.as_deref() {
            Some("light") => "light".to_string(),
            Some("dark") => "dark".to_string(),
            _ => "system".to_string(),
        }
    }

    /// Палитра оформления из настроек приложения.
    ///
    /// Возвращается как есть (реестр палитр принадлежит дизайн-системе, ядро
    /// его не знает); отсутствующее значение заменяется палитрой по умолчанию
    /// `gruvbox`.
    pub fn theme_palette(&mut self) -> String {
        self.app_setting_string("appearance.palette")
            .unwrap_or_else(|| "gruvbox".to_string())
    }

    /// Тема области чтения из настроек приложения.
    ///
    /// Область чтения оформляется независимо от темы интерфейса: значения
    /// `light` и `dark` возвращаются как есть; неизвестное или отсутствующее
    /// значение трактуется как `light`.
    pub fn reader_theme(&mut self) -> String {
        match self.app_setting_string("reader.theme").as_deref() {
            Some("dark") => "dark".to_string(),
            _ => "light".to_string(),
        }
    }

    /// Чтение логического значения из секции настроек приложения.
    fn app_setting_bool(&mut self, key: &str) -> Option<bool> {
        self.app_setting_value(key)
            .and_then(|value| value.as_bool())
    }

    /// Чтение строкового значения из секции настроек приложения.
    fn app_setting_string(&mut self, key: &str) -> Option<String> {
        self.app_setting_value(key)
            .and_then(|value| value.as_str().map(str::to_string))
    }

    /// Чтение значения по ключу из секции настроек приложения.
    fn app_setting_value(&mut self, key: &str) -> Option<serde_json::Value> {
        let response = self
            .runtime
            .invoke_capability(
                CAPABILITY_SETTINGS,
                "get",
                serde_json::json!({ "section": "app.general" }),
            )
            .ok()?;
        serde_json::from_str::<serde_json::Value>(&response)
            .ok()?
            .get("values")
            .and_then(|values| values.get(key))
            .cloned()
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
