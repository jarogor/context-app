//! Книга каталога со всеми связями.

use super::author::Author;
use super::book_file::BookFile;
use super::series_link::SeriesLink;
use super::tag::Tag;

/// Полная модель книги с авторами, сериями, тегами и файлами.
#[derive(Debug, Clone, serde::Serialize)]
pub struct Book {
  pub id: i64,
  pub uuid: String,
  pub title: String,
  pub created_at: String,
  pub updated_at: String,
  pub authors: Vec<Author>,
  pub series: Vec<SeriesLink>,
  pub tags: Vec<Tag>,
  pub files: Vec<BookFile>,
}