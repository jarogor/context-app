//! Модели данных внешнего источника книг.
//!
//! Содержит только структуры и перечисления без поведенческой логики.
//! Разбор источников выполняется source-плагинами, работа с индексом живёт
//! в соседних модулях, а конвертации между представлениями индекса и
//! источника — в `index`.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

/// Книга внешнего источника, возвращённая source-плагином.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct ExternalBook {
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

/// Файл книги внешнего источника.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct ExternalFile {
    /// Назначение файла: содержимое или обложка.
    pub kind: ExternalFileKind,
    /// Путь к файлу относительно корня библиотеки.
    pub path: PathBuf,
    /// Расширение файла в нижнем регистре.
    pub format: String,
}

/// Назначение файла в папке книги внешнего источника.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum ExternalFileKind {
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
