//! Модели данных базового source-плагина библиотеки.
//!
//! Содержит только структуры и перечисления без поведенческой логики.
//! Структуры повторяют контракт ядра (`sources::models`): разбор их из JSON
//! выполняется приложением, поэтому имена и порядок полей должны совпадать.

use serde::Serialize;

/// Книга, обнаруженная при сканировании директории.
#[derive(Debug, Clone, Serialize)]
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

/// Файл, обнаруженный при сканировании папки книги.
#[derive(Debug, Clone, Serialize)]
pub(crate) struct ExternalFile {
    /// Назначение файла: содержимое или обложка.
    pub kind: ExternalFileKind,
    /// Путь к файлу относительно корня библиотеки.
    pub path: String,
    /// Расширение файла в нижнем регистре.
    pub format: String,
}

/// Назначение файла в папке книги.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum ExternalFileKind {
    /// Файл содержимого книги.
    Book,
    /// Файл обложки.
    Cover,
}
