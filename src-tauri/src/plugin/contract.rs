//! Контракт extension point плагинной подсистемы.
//!
//! Контракт определяет стабильную точку расширения приложения:
//! версизацию контракта и набор host-функций, предоставляемых приложением.
//! Структура манифеста плагина определена в `super::PluginManifest`.

/// Версия контракта, поддерживаемая текущим приложением.
pub const CONTRACT_VERSION: u32 = 2;

/// Имя файла манифеста плагина.
pub const MANIFEST_FILE_NAME: &str = "plugin-manifest.json";

/// Имя экспортируемой функции, ожидаемой от плагинов.
pub const EXPORT_FUNCTION: &str = "invoke";

/// Имя host-функции логирования, предоставляемой приложением.
pub const HOST_LOG_FUNCTION: &str = "log";

/// Имя host-функции перечисления содержимого директории библиотеки.
pub const HOST_FS_LIST_DIR: &str = "fs_list_dir";

/// Имя host-функции чтения текстового файла библиотеки.
pub const HOST_FS_READ_TEXT: &str = "fs_read_text";

/// Список host-функций, предоставляемых приложением.
pub const HOST_FUNCTIONS: &[&str] = &[HOST_LOG_FUNCTION, HOST_FS_LIST_DIR, HOST_FS_READ_TEXT];
