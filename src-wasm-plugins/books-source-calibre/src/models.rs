//! Модели data source-плагина Calibre.
//!
//! Общие модели нейтрального каталога живут в `source-protocol::models` и
//! реэкспортируются, чтобы код плагина обращался к ним как `crate::models`.
//! Набор используется в разных конфигурациях сборки (WASM, нативные тесты),
//! поэтому неиспользуемые в конкретной конфигурации имена допускаются.
//! Здесь же — модель папки книги, специфичная для раскладки Calibre.

#[allow(unused_imports)]
pub(crate) use source_protocol::models::{
    DirEntry, EntryKind, ExternalBook, ExternalFile, ExternalFileKind, SourceCapabilities,
    SourceCatalog, SOURCE_PROTOCOL_VERSION,
};

/// Папка книги, обнаруженная без чтения метаданных.
///
/// Используется для инкрементального сопоставления с индексом: подпись из
/// имён, размеров и времён изменения файлов папки позволяет пропустить
/// повторный разбор `metadata.opf`/EPUB, если содержимое не изменилось.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct BookListing {
    /// Путь папки книги относительно корня (он же идентификатор книги).
    pub id: String,
    /// Автор из имени родительской папки.
    pub author: String,
    /// Файлы книги: содержимое и обложка.
    pub files: Vec<ExternalFile>,
    /// Имя файла `metadata.opf`, если он присутствует в папке.
    pub opf: Option<String>,
    /// Подпись содержимого папки.
    pub signature: String,
    /// Доступны ли для всех файлов размер и время изменения.
    pub reliable: bool,
}
