//! Общие константы приложения.
//!
//! Централизованные имена файлов, папок и настроек приложения.

/// Имя demo-плагина — runtime-имя из манифеста, по которому он вызывается.
pub const DEMO_PLUGIN_NAME: &str = "demo";

/// Имя папки source-плагина библиотеки, поставляемого с приложением.
pub const LIBRARY_PLUGIN_DIR: &str = "library";

/// Имя файла конфигурации приложения.
pub const CONFIG_FILE_NAME: &str = "app-config.toml";

/// Путь к библиотеке по умолчанию (относительно корня проекта).
pub const DEFAULT_LIBRARY_DIR: &str = "dev_data/library";

/// Имя папки с плагинами.
pub const PLUGINS_DIR_NAME: &str = "plugins";
