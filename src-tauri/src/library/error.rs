//! Типы ошибок слоя портируемой библиотеки.

use std::io;
use std::path::PathBuf;

/// Ошибка, возникающая при работе с портируемой директорией библиотеки.
#[derive(Debug)]
pub enum LibraryError {
  /// Указанный путь не является директорией.
  NotADirectory(PathBuf),
  /// Ошибка файловой операции.
  Io(io::Error),
  /// Ошибка при работе с базой данных.
  Database(rusqlite::Error),
}

impl From<io::Error> for LibraryError {
  fn from(value: io::Error) -> Self {
    Self::Io(value)
  }
}

impl From<rusqlite::Error> for LibraryError {
  fn from(value: rusqlite::Error) -> Self {
    Self::Database(value)
  }
}

impl std::fmt::Display for LibraryError {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    match self {
      Self::NotADirectory(path) => write!(f, "путь не является директорией: {}", path.display()),
      Self::Io(err) => write!(f, "ошибка ввода-вывода: {err}"),
      Self::Database(err) => write!(f, "ошибка базы данных: {err}"),
    }
  }
}

impl std::error::Error for LibraryError {
  fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
    match self {
      Self::NotADirectory(_) => None,
      Self::Io(err) => Some(err),
      Self::Database(err) => Some(err),
    }
  }
}