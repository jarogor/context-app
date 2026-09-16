//! Книга каталога со всеми связями.

use super::author::Author;
use super::book_file::BookFile;
use super::series_link::SeriesLink;
use super::tag::Tag;

/// Полная модель книги с авторами, сериями, тегами и файлами.
#[derive(Debug, Clone, serde::Serialize)]
pub struct Book {
    /// Идентификатор книги в базе данных.
    pub id: i64,
    /// Уникальный идентификатор книги (UUID).
    pub uuid: String,
    /// Название книги.
    pub title: String,
    /// Дата создания записи.
    pub created_at: String,
    /// Дата последнего обновления записи.
    pub updated_at: String,
    /// Авторы книги в порядке сортировки.
    pub authors: Vec<Author>,
    /// Серии, к которым относится книга.
    pub series: Vec<SeriesLink>,
    /// Теги книги.
    pub tags: Vec<Tag>,
    /// Файлы книги: содержимое и обложка.
    pub files: Vec<BookFile>,
}
