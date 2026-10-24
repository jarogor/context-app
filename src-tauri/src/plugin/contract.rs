//! Контракт extension point плагинной подсистемы.
//!
//! Контракт определяет стабильную точку расширения приложения:
//! версизацию контракта и набор host-функций, предоставляемых приложением.
//! Структура манифеста плагина определена в `super::PluginManifest`.

/// Единственная версия контракта, поддерживаемая текущим приложением.
pub const CONTRACT_VERSION: u32 = 1;

/// Имя файла манифеста плагина.
pub const MANIFEST_FILE_NAME: &str = "plugin-manifest.json";

/// Имя экспортируемой функции, ожидаемой от плагинов.
pub const EXPORT_FUNCTION: &str = "invoke";

/// Имя host-функции технического логирования, предоставляемой приложением.
///
/// Сигнатура: `log(severity, message, details)`.
pub const HOST_LOG_FUNCTION: &str = "log";
/// Имя host-функции публикации уведомления плагином.
///
/// Сигнатура: `notify(level, severity, message, details)`.
pub const HOST_NOTIFY_FUNCTION: &str = "notify";

/// Имя host-функции перечисления содержимого source-корня.
pub const HOST_FS_LIST_DIR: &str = "fs_list_dir";

/// Имя host-функции чтения текстового файла source-корня.
pub const HOST_FS_READ_TEXT: &str = "fs_read_text";

/// Имя host-функции чтения бинарного файла в base64.
pub const HOST_FS_READ_BYTES: &str = "fs_read_bytes";
/// Имя host-функции чтения выбранного пользователем файла импорта.
pub const HOST_IMPORT_READ_BYTES: &str = "import_read_bytes";
/// Имя host-функции записи файла в source-корень.
pub const HOST_FS_WRITE_BYTES: &str = "fs_write_bytes";

/// Имя host-функции открытия файла системным приложением.
pub const HOST_OPEN_FILE: &str = "open_file";

/// Имя host-функции публикации прикладного события плагином.
pub const HOST_EMIT_EVENT: &str = "emit_event";

/// Capability журнала уведомлений, предоставляемая базовым плагином.
pub const CAPABILITY_NOTIFICATIONS: &str = "notifications.journal@1";

/// Capability реестра и хранилища настроек, предоставляемая базовым плагином.
pub const CAPABILITY_SETTINGS: &str = "settings.store@1";

/// Capability стора плагинов: управление активностью и установкой плагинов.
pub const CAPABILITY_PLUGIN_STORE: &str = "plugin-store@1";

/// Capability наборов заметок, предоставляемая базовым плагином.
pub const CAPABILITY_NOTES: &str = "notes.store@1";

/// Имя host-функции чтения служебного состояния source-плагина.
pub const HOST_STATE_READ: &str = "state_read";

/// Имя host-функции атомарной записи служебного состояния source-плагина.
pub const HOST_STATE_WRITE: &str = "state_write";

/// Имя host-функции удаления служебного состояния source-плагина.
pub const HOST_STATE_DELETE: &str = "state_delete";

/// Имя host-функции текущего времени Unix в миллисекундах.
pub const HOST_NOW_FUNCTION: &str = "now_millis";

/// Имя host-функции исполнения SQL в хранилище активной библиотеки.
///
/// Сигнатура: `sql_execute(sql, params)`; `params` — JSON-массив скаляров.
pub const HOST_SQL_EXECUTE: &str = "sql_execute";

/// Имя host-функции чтения строк SQL-запроса в хранилище активной библиотеки.
///
/// Сигнатура: `sql_query(sql, params)`; результат — JSON-массив объектов.
pub const HOST_SQL_QUERY: &str = "sql_query";

/// Имя привилегированной host-функции инспекции пакета плагина.
pub const HOST_STORE_INSPECT: &str = "store_inspect";

/// Имя привилегированной host-функции установки пакета плагина.
pub const HOST_STORE_INSTALL: &str = "store_install";

/// Имя привилегированной host-функции удаления установленного плагина.
pub const HOST_STORE_UNINSTALL: &str = "store_uninstall";

/// Имя привилегированной host-функции списка установленных плагинов.
pub const HOST_STORE_INSTALLED: &str = "store_installed";

/// Имя привилегированной host-функции перечня отключаемых плагинов.
pub const HOST_STORE_PLUGINS: &str = "store_plugins";

/// Имя привилегированной host-функции переключения активности плагина.
pub const HOST_STORE_SET_ENABLED: &str = "store_set_enabled";

/// Список привилегированных host-функций стора плагинов.
///
/// Функции выдаются только плагинам, объявившим их в `host_functions`.
pub const STORE_HOST_FUNCTIONS: &[&str] = &[
    HOST_STORE_INSPECT,
    HOST_STORE_INSTALL,
    HOST_STORE_UNINSTALL,
    HOST_STORE_INSTALLED,
    HOST_STORE_PLUGINS,
    HOST_STORE_SET_ENABLED,
];

/// Набор прав — host-функций, известных каркасу.
///
/// Манифест SHALL объявлять только права из этого набора: неизвестное право
/// отклоняется с диагностикой, потому что расширение набора требует изменения
/// каркаса, а не только манифеста. Принцип — как у разрешений мобильных
/// приложений: набор известен заранее, плагин запрашивает объявленное.
pub const KNOWN_HOST_FUNCTIONS: &[&str] = &[
    HOST_LOG_FUNCTION,
    HOST_NOTIFY_FUNCTION,
    HOST_FS_LIST_DIR,
    HOST_FS_READ_TEXT,
    HOST_FS_READ_BYTES,
    HOST_IMPORT_READ_BYTES,
    HOST_FS_WRITE_BYTES,
    HOST_OPEN_FILE,
    HOST_EMIT_EVENT,
    HOST_STATE_READ,
    HOST_STATE_WRITE,
    HOST_STATE_DELETE,
    HOST_NOW_FUNCTION,
    HOST_SQL_EXECUTE,
    HOST_SQL_QUERY,
    HOST_STORE_INSPECT,
    HOST_STORE_INSTALL,
    HOST_STORE_UNINSTALL,
    HOST_STORE_INSTALLED,
    HOST_STORE_PLUGINS,
    HOST_STORE_SET_ENABLED,
];

/// Признак, что host-функция известна каркасу как право плагина.
pub fn is_known_host_function(function: &str) -> bool {
    KNOWN_HOST_FUNCTIONS.contains(&function)
}
