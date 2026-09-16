//! Модели данных модуля Calibre.
//!
//! Содержит только структуры и перечисления без поведенческой логики.
//! Разбор OPF, сканирование и работа с индексом живут в соседних модулях,
//! а конвертации между представлениями индекса и сканера — в `index`.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

/// Разобранные метаданные файла `metadata.opf`.
#[derive(Debug, Default)]
pub(crate) struct Metadata {
    /// Название книги.
    pub title: Option<String>,
    /// Авторы в порядке объявления.
    pub authors: Vec<String>,
    /// Теги (subject).
    pub tags: Vec<String>,
    /// Язык книги.
    pub language: Option<String>,
    /// Имя файла обложки, объявленное в OPF.
    pub cover: Option<String>,
    /// Серия и порядковый номер книги внутри серии.
    pub series: Option<(String, i64)>,
}

/// Книга, обнаруженная при сканировании директории Calibre.
#[derive(Debug, Clone)]
pub(crate) struct ScannedBook {
    /// Название книги.
    pub title: String,
    /// Авторы книги.
    pub authors: Vec<String>,
    /// Теги книги.
    pub tags: Vec<String>,
    /// Серии книги с порядковыми номерами.
    pub series: Vec<(String, i64)>,
    /// Файлы книги: содержимое и обложка.
    pub files: Vec<ScannedFile>,
}

/// Файл, обнаруженный при сканировании папки книги.
#[derive(Debug, Clone)]
pub(crate) struct ScannedFile {
    /// Назначение файла: содержимое или обложка.
    pub kind: ScannedFileKind,
    /// Путь к файлу относительно корня библиотеки.
    pub path: PathBuf,
    /// Расширение файла в нижнем регистре.
    pub format: String,
}

/// Назначение файла в папке книги Calibre.
#[derive(Debug, Clone, Copy)]
pub(crate) enum ScannedFileKind {
    /// Файл содержимого книги.
    Book,
    /// Файл обложки.
    Cover,
}

/// Книга, сохранённая в локальном индексе библиотеки.
#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct IndexedBook {
    /// Путь к папке книги относительно корня библиотеки.
    #[serde(default)]
    pub directory: String,
    /// Время изменения `metadata.opf` в наносекундах (0 — неизвестно).
    #[serde(default)]
    pub metadata_modified: u128,
    /// Название книги.
    pub title: String,
    /// Авторы книги.
    pub authors: Vec<String>,
    /// Теги книги.
    pub tags: Vec<String>,
    /// Серии книги с порядковыми номерами.
    pub series: Vec<(String, i64)>,
    /// Файлы книги.
    pub files: Vec<IndexedFile>,
}

/// Файл книги, сохранённый в локальном индексе.
#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct IndexedFile {
    /// Назначение файла: содержимое или обложка.
    pub kind: IndexedFileKind,
    /// Путь к файлу относительно корня библиотеки.
    pub path: String,
    /// Расширение файла.
    pub format: String,
    /// Время изменения файла в наносекундах (0 — неизвестно).
    pub modified: u128,
    /// Размер файла в байтах.
    pub size: u64,
}

/// Назначение файла в сохранённом индексе.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub(crate) enum IndexedFileKind {
    /// Файл содержимого книги.
    Book,
    /// Файл обложки.
    Cover,
}

/// Сохранённый индекс одной внешней библиотеки для списка в UI.
#[derive(Debug, Clone, Serialize)]
pub struct CachedLibrary {
    /// Корневой путь исходной библиотеки.
    pub path: String,
    /// Путь к JSON-файлу индекса.
    pub index_path: PathBuf,
    /// Путь к SQLite-файлу виртуального каталога.
    pub catalog_path: PathBuf,
    /// Доступна ли исходная директория в момент чтения списка.
    pub available: bool,
}
