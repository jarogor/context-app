//! Спецификации служебных JSON-документов: маркер, версия и схема.
//!
//! Каждый служебный файл приложения описан схемой из каталога `schemas/`
//! (JSON Schema 2020-12). Схема — источник истины по форме документа; она
//! проверяется в тестах на примерах и применяется в работе при чтении и записи.
//!
//! **Идентификация.** Файл опознаётся по метке `format` (`context.<вид>`): чужой
//! JSON с другой меткой не принимается за наш документ. Файлы, написанные до
//! появления метки, читаются как версия `0` и переписываются с меткой при
//! следующем сохранении.
//!
//! **Версионирование.** Поле `version` — версия формата. Документ более новой
//! версии не читается: приложение не угадывает незнакомую форму.
//!
//! **Валидация.** Чтение разбирает документ как значение, проверяет метку,
//! версию и схему и только потом отдаёт модель. Запись проверяет документ перед
//! сохранением: битый документ не попадает на диск.

pub mod models;
pub mod schema;
pub mod store;

pub use models::{DocumentKind, DocumentVersion, Owner, Upgrade};
pub use store::{read, read_or_default, write};

/// Реестр рабочих мест.
pub static WORKSPACES: DocumentKind = DocumentKind {
    format: "context.workspaces",
    schema_name: "workspaces",
    owner: Owner::Core,
    versions: &[DocumentVersion::only(
        1,
        include_str!("../../../schemas/v1/workspaces.schema.json"),
    )],
};

/// История открытых библиотек.
pub static LIBRARY_HISTORY: DocumentKind = DocumentKind {
    format: "context.library-history",
    schema_name: "library-history",
    owner: Owner::Core,
    versions: &[DocumentVersion::only(
        1,
        include_str!("../../../schemas/v1/library-history.schema.json"),
    )],
};

/// Кэш обложек книг по пути.
pub static COVER_CACHE: DocumentKind = DocumentKind {
    format: "context.cover-cache",
    schema_name: "cover-cache",
    owner: Owner::Core,
    versions: &[DocumentVersion::only(
        1,
        include_str!("../../../schemas/v1/cover-cache.schema.json"),
    )],
};

/// Кэш свойств открытого файла.
pub static READER_CACHE: DocumentKind = DocumentKind {
    format: "context.reader-cache",
    schema_name: "reader-cache",
    owner: Owner::Core,
    versions: &[DocumentVersion::only(
        1,
        include_str!("../../../schemas/v1/reader-cache.schema.json"),
    )],
};

/// Реестр отключённых плагинов.
pub static DISABLED_PLUGINS: DocumentKind = DocumentKind {
    format: "context.disabled-plugins",
    schema_name: "disabled-plugins",
    owner: Owner::Core,
    versions: &[DocumentVersion::only(
        1,
        include_str!("../../../schemas/v1/disabled-plugins.schema.json"),
    )],
};

/// Состояние обновлений.
pub static UPDATES: DocumentKind = DocumentKind {
    format: "context.updates",
    schema_name: "updates",
    owner: Owner::Core,
    versions: &[DocumentVersion::only(
        1,
        include_str!("../../../schemas/v1/updates.schema.json"),
    )],
};

/// Манифест плагина: метка — имя файла, версия — `contract_version`.
pub static PLUGIN_MANIFEST: DocumentKind = DocumentKind {
    format: "contract_version",
    schema_name: "plugin-manifest",
    owner: Owner::Framework,
    versions: &[DocumentVersion::only(
        1,
        include_str!("../../../schemas/v1/plugin-manifest.schema.json"),
    )],
};

/// Индекс обновлений в источнике.
pub static UPDATE_INDEX: DocumentKind = DocumentKind {
    format: "contract_version",
    schema_name: "update-index",
    owner: Owner::External,
    versions: &[DocumentVersion::only(
        1,
        include_str!("../../../schemas/v1/update-index.schema.json"),
    )],
};

/// Состояние плагина заметок.
pub static NOTES_STATE: DocumentKind = DocumentKind {
    format: "context.notes-state",
    schema_name: "notes-state",
    owner: Owner::Plugin,
    versions: &[DocumentVersion::only(
        1,
        include_str!("../../../schemas/v1/notes-state.schema.json"),
    )],
};

/// Состояние плагина настроек.
pub static SETTINGS_STATE: DocumentKind = DocumentKind {
    format: "context.settings-state",
    schema_name: "settings-state",
    owner: Owner::Plugin,
    versions: &[DocumentVersion::only(
        1,
        include_str!("../../../schemas/v1/settings-state.schema.json"),
    )],
};

/// Состояние плагина стора.
pub static PLUGIN_STORE_STATE: DocumentKind = DocumentKind {
    format: "context.plugin-store-state",
    schema_name: "plugin-store-state",
    owner: Owner::Plugin,
    versions: &[DocumentVersion::only(
        1,
        include_str!("../../../schemas/v1/plugin-store-state.schema.json"),
    )],
};

/// Переносимый набор заметок: файл обмена, метка обязательна.
pub static NOTES_SET: DocumentKind = DocumentKind {
    format: "context.notes-set",
    schema_name: "notes-set",
    owner: Owner::Plugin,
    versions: &[DocumentVersion::only(
        1,
        include_str!("../../../schemas/v1/notes-set.schema.json"),
    )],
};

/// Пользовательские свойства книг: правки и теги поверх источника.
pub static BOOK_PROPERTIES: DocumentKind = DocumentKind {
    format: "context.book-properties",
    schema_name: "book-properties",
    owner: Owner::Core,
    versions: &[DocumentVersion::only(
        1,
        include_str!("../../../schemas/v1/book-properties.schema.json"),
    )],
};

pub static ALL: [&DocumentKind; 13] = [
    &WORKSPACES,
    &LIBRARY_HISTORY,
    &COVER_CACHE,
    &READER_CACHE,
    &DISABLED_PLUGINS,
    &UPDATES,
    &PLUGIN_MANIFEST,
    &UPDATE_INDEX,
    &NOTES_STATE,
    &SETTINGS_STATE,
    &PLUGIN_STORE_STATE,
    &NOTES_SET,
    &BOOK_PROPERTIES,
];

#[cfg(test)]
#[path = "specs_tests.rs"]
mod specs;
