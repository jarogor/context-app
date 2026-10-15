//! Модели generic-источника библиотеки.
//!
//! Общие модели нейтрального каталога живут в `source-protocol::models` и
//! реэкспортируются, чтобы код плагина обращался к ним как `crate::models`.
//! Набор используется в разных конфигурациях сборки (WASM, нативные тесты),
//! поэтому неиспользуемые в конкретной конфигурации имена допускаются.
//! Здесь же — модель файла, специфичная для generic-источника.

#[allow(unused_imports)]
pub(crate) use source_protocol::models::{
    BookMetadata, DirEntry, EntryKind, ExternalBook, ExternalFile, ExternalFileKind,
    SourceCapabilities, SourceCatalog, SOURCE_PROTOCOL_VERSION,
};

/// Файл книги, обнаруженный без чтения содержимого.
///
/// Используется для инкрементального сопоставления с индексом: метаданные
/// файла позволяют пропустить повторное чтение неизменённых книг.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct FileListing {
    /// Путь к файлу относительно корня библиотеки (он же идентификатор книги).
    pub path: String,
    /// Расширение файла в нижнем регистре.
    pub format: String,
    /// Размер файла в байтах.
    pub size: Option<u64>,
    /// Время изменения в миллисекундах Unix.
    pub mtime_ms: Option<i64>,
}
