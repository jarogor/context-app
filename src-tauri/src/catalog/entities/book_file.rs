//! Файл, связанный с книгой.

use crate::catalog::FileKind;

/// Файл содержимого или обложки книги.
///
/// Путь хранится относительно корня портируемой директории библиотеки.
pub struct BookFile {
  pub id: i64,
  pub book_id: i64,
  pub kind: FileKind,
  pub path: String,
  pub format: String,
}