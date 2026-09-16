//! Входные данные для создания новой книги.

use crate::catalog::FileKind;

/// Данные файла книги при создании записи.
pub struct NewFile {
    /// Назначение файла: содержимое или обложка.
    pub kind: FileKind,
    /// Путь к файлу относительно корня библиотеки.
    pub path: String,
    /// Расширение файла.
    pub format: String,
}

/// Данные новой книги: базовые атрибуты и набора связей.
pub struct NewBook {
    /// Стабильный идентификатор для внешнего каталога, если он задан.
    pub stable_id: Option<i64>,
    /// Название книги.
    pub title: String,
    /// Авторы книги.
    pub authors: Vec<String>,
    /// Серии книги с порядковыми номерами.
    pub series: Vec<(String, i64)>,
    /// Теги книги.
    pub tags: Vec<String>,
    /// Файлы книги.
    pub files: Vec<NewFile>,
}
