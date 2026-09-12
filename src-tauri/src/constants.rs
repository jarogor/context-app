//! Общие константы приложения.
//!
//! Централизованные имена файлов, папок и переменных окружения, используемые
//! настройкой, библиотекой и запуском приложения. Доменные контрактные
//! константы (схема БД, контракт плагинов) остаются в своих модулях.

/// Имя папки demo-плагина, помещаемой в библиотеку при первом старте.
pub const DEMO_PLUGIN_DIR: &str = "demo-plugin";

/// Имя файла конфигурации приложения.
pub const CONFIG_FILE_NAME: &str = "app-config.toml";

/// Путь к библиотеке по умолчанию (относительно корня проекта).
pub const DEFAULT_LIBRARY_DIR: &str = "dev_data/library";

/// Переменная окружения, переопределяющая путь к библиотеке.
pub const LIBRARY_DIR_ENV: &str = "BOOKLIB_LIBRARY_DIR";

/// Имя файла SQLite-базы внутри портируемой директории.
pub const DATABASE_FILE_NAME: &str = "library.db";

/// Имя папки с файлами книг.
pub const BOOKS_DIR_NAME: &str = "books";

/// Имя папки с обложками.
pub const COVERS_DIR_NAME: &str = "covers";

/// Имя папки с плагинами.
pub const PLUGINS_DIR_NAME: &str = "plugins";
