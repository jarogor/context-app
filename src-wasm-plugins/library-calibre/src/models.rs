//! Модели данных source-плагина Calibre.
//!
//! Содержит только структуры и перечисления без поведенческой логики.
//! Структуры повторяют контракт ядра: разбор их из JSON выполняется
//! приложением, поэтому имена и порядок полей должны совпадать.

use serde::{Deserialize, Serialize};

/// Версия протокола source lifecycle.
pub(crate) const SOURCE_PROTOCOL_VERSION: u32 = 1;

/// Книга, обнаруженная при сканировании директории.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub(crate) struct ExternalBook {
    /// Стабильный идентификатор книги внутри source-плагина.
    pub id: String,
    /// Название книги.
    pub title: String,
    /// Авторы книги.
    pub authors: Vec<String>,
    /// Теги книги.
    pub tags: Vec<String>,
    /// Серии книги с порядковыми номерами.
    pub series: Vec<(String, i64)>,
    /// Файлы книги: содержимое и обложка.
    pub files: Vec<ExternalFile>,
}

/// Файл, обнаруженный при сканировании папки книги.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub(crate) struct ExternalFile {
    /// Назначение файла: содержимое или обложка.
    pub kind: ExternalFileKind,
    /// Путь к файлу относительно корня библиотеки.
    pub path: String,
    /// Расширение файла в нижнем регистре.
    pub format: String,
}

/// Назначение файла в папке книги.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum ExternalFileKind {
    /// Файл содержимого книги.
    Book,
    /// Файл обложки.
    Cover,
}

/// Возможности source-плагина.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct SourceCapabilities {
    /// Версия протокола source lifecycle.
    pub protocol_version: u32,
    /// Поддерживается ли служебное состояние.
    pub state_storage: bool,
    /// Поддерживается ли инкрементальная синхронизация.
    pub incremental_sync: bool,
}

/// Нейтральный snapshot каталога.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub(crate) struct SourceCatalog {
    /// Версия протокола snapshot.
    pub protocol_version: u32,
    /// Номер ревизии каталога.
    pub revision: u64,
    /// Книги каталога.
    pub books: Vec<ExternalBook>,
}

/// Тип записи директории без следования по символической ссылке.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum EntryKind {
    /// Обычный файл.
    File,
    /// Каталог.
    Dir,
    /// Символическая ссылка.
    Symlink,
}

/// Запись директории.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub(crate) struct DirEntry {
    /// Имя записи.
    pub name: String,
    /// Тип записи.
    pub kind: EntryKind,
    /// Размер файла в байтах; `None` для каталогов, ссылок и при недоступности.
    #[serde(default)]
    pub size: Option<u64>,
    /// Время изменения в миллисекундах Unix; `None` при недоступности.
    #[serde(default)]
    pub mtime_ms: Option<i64>,
}

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
