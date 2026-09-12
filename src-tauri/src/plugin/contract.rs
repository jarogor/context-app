//! Контракт extension point плагинной подсистемы.
//!
//! Контракт определяет стабильную точку расширения приложения:
//! версизацию контракта и набор host-функций, предоставляемых приложением.
//! Структура манифеста плагина определена в `super::PluginManifest`.

/// Версия контракта, поддерживаемая текущим приложением.
pub const CONTRACT_VERSION: u32 = 1;

/// Имя файла манифеста плагина.
pub const MANIFEST_FILE_NAME: &str = "plugin-manifest.json";

/// Имя экспортируемой функции, ожидаемой от плагинов.
pub const EXPORT_FUNCTION: &str = "invoke";

/// Имя host-функции логирования, предоставляемой приложением.
pub const HOST_LOG_FUNCTION: &str = "log";

/// Список host-функций, предоставляемых приложением.
pub const HOST_FUNCTIONS: &[&str] = &[HOST_LOG_FUNCTION];
