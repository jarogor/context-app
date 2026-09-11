//! Входные данные для создания новой книги.

use crate::catalog::FileKind;

/// Данные файла книги при создании записи.
pub struct NewFile {
    pub kind: FileKind,
    pub path: String,
    pub format: String,
}

/// Данные новой книги: базовые атрибуты и набора связей.
pub struct NewBook {
    pub title: String,
    pub authors: Vec<String>,
    pub series: Vec<(String, i64)>,
    pub tags: Vec<String>,
    pub files: Vec<NewFile>,
}
