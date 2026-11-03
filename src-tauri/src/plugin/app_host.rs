//! App-level runtime базовых плагинов каркаса.
//!
//! Базовые плагины (настройки, стор, заметки) загружаются один раз на уровне
//! всего приложения и не зависят от активной библиотеки.

use std::path::{Path, PathBuf};

use crate::plugin::contract::CAPABILITY_SETTINGS;
use crate::plugin::{get_bus, PluginError, PluginRuntime, PluginScope, Severity};

/// Декларация собственной секции настроек приложения.
///
/// Схема передаётся базовому плагину настроек как opaque-декларация и не
/// интерпретируется ядром, кроме собственного ключа приложения.
const APP_SETTINGS_SCHEMA: &str = r#"{
  "title": "app.settings.app.owner",
  "sections": [
    {
      "id": "general",
      "title": "app.settings.app.general.title",
      "description": "app.settings.app.general.description",
      "fields": [
        {
          "key": "appearance.language",
          "title": "app.settings.app.general.appearance.language.label",
          "type": "select",
          "description": "app.settings.app.general.appearance.language.description",
          "default": "ru",
          "options": [
            { "value": "ru", "title": "app.settings.app.general.appearance.language.option.ru" },
            { "value": "en", "title": "app.settings.app.general.appearance.language.option.en" }
          ]
        },
        {
          "key": "appearance.theme",
          "title": "app.settings.app.general.appearance.theme.label",
          "type": "select",
          "description": "app.settings.app.general.appearance.theme.description",
          "default": "system",
          "options": [
            { "value": "light", "title": "app.settings.app.general.appearance.theme.option.light" },
            { "value": "dark", "title": "app.settings.app.general.appearance.theme.option.dark" },
            { "value": "system", "title": "app.settings.app.general.appearance.theme.option.system" }
          ]
        },
        {
          "key": "appearance.palette",
          "title": "app.settings.app.general.appearance.palette.label",
          "type": "select",
          "description": "app.settings.app.general.appearance.palette.description",
          "default": "linen",
          "options": [
            { "value": "linen", "title": "app.settings.app.general.appearance.palette.option.linen" },
            { "value": "cobalt", "title": "app.settings.app.general.appearance.palette.option.cobalt" },
            { "value": "gruvbox", "title": "app.settings.app.general.appearance.palette.option.gruvbox" },
            { "value": "mist", "title": "app.settings.app.general.appearance.palette.option.mist" }
          ]
        },
        {
          "key": "window.open_tabs_limit",
          "title": "app.settings.app.general.window.open_tabs_limit.label",
          "type": "number",
          "description": "app.settings.app.general.window.open_tabs_limit.description",
          "default": 50
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
        let mut runtime = PluginRuntime::load_scopes(
            directories,
            PathBuf::from("."),
            Some(&[PluginScope::Application]),
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

    /// Запись сообщения, адресованного пользователю, в журнал диагностики.
    ///
    /// Отдельной ленты уведомлений в интерфейсе нет: сообщение живёт в файле,
    /// который пользователь прикладывает к отчёту о сбое. Поэтому запись идёт
    /// тем же путём, что техническая диагностика, и ничего не доставляет
    /// плагину.
    pub fn notify_user(
        &mut self,
        severity: Severity,
        message: impl Into<String>,
        source: impl Into<String>,
        details: serde_json::Value,
    ) {
        get_bus().publish(severity, message, source, details);
    }

    /// Запись технического события в журнал диагностики.
    ///
    /// Доставки плагину уведомлений нет: технические события пользователю не
    /// адресованы и живут в файле, из которого собирается отчёт.
    #[cfg(test)]
    pub fn notify_technical(
        &mut self,
        severity: Severity,
        message: impl Into<String>,
        source: impl Into<String>,
        details: serde_json::Value,
    ) {
        get_bus().publish(severity, message, source, details);
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
                get_bus().publish(
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
            get_bus().publish(
                Severity::Warn,
                format!("Не удалось обновить реестр настроек: {error}"),
                "core",
                serde_json::json!({}),
            );
            return Err(error);
        }
        Ok(())
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
    /// `linen`.
    pub fn theme_palette(&mut self) -> String {
        self.app_setting_string("appearance.palette")
            .unwrap_or_else(|| "linen".to_string())
    }

    /// Язык интерфейса из настроек приложения.
    ///
    /// Поддерживаются `ru` и `en`; неизвестное или отсутствующее значение
    /// трактуется как `ru` — до явного выбора интерфейс русский.
    pub fn interface_locale(&mut self) -> String {
        match self.app_setting_string("appearance.language").as_deref() {
            Some("en") => "en".to_string(),
            _ => "ru".to_string(),
        }
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

    /// Гарнитура книги из настроек приложения.
    ///
    /// `serif` — шрифт с засечками (по умолчанию, так набирают прозу), `sans` —
    /// без засечек. Неизвестное или отсутствующее значение трактуется как
    /// `serif`, чтобы книга не осталась без выбранного шрифта.
    pub fn reader_font(&mut self) -> String {
        match self.app_setting_string("reader.font").as_deref() {
            Some("sans") => "sans".to_string(),
            _ => "serif".to_string(),
        }
    }

    /// Лимит числа открытых вкладок рабочего места из настроек приложения.
    ///
    /// Отсутствующее или некорректное значение заменяется значением по умолчанию
    /// `50`; значение меньше единицы приводится к единице — открытие хотя бы
    /// одной вкладки должно оставаться возможным.
    pub fn open_tabs_limit(&mut self) -> u32 {
        const DEFAULT_LIMIT: u32 = 50;
        self.app_setting_value("window.open_tabs_limit")
            .and_then(|value| value.as_f64())
            .filter(|value| value.is_finite())
            .map(|value| u32::try_from((value.trunc() as i64).max(1)).unwrap_or(DEFAULT_LIMIT))
            .unwrap_or(DEFAULT_LIMIT)
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
