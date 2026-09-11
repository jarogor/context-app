//! Типы ошибок чтения книг.

use std::io;
use std::path::PathBuf;

/// Ошибка, возникающая при чтении содержимого книги.
#[derive(Debug)]
pub enum ReadingError {
  /// Файл не является корректным EPUB.
  InvalidEpub(PathBuf),
  /// Ошибка ввода-вывода.
  Io(io::Error),
}

impl From<io::Error> for ReadingError {
  fn from(value: io::Error) -> Self {
    Self::Io(value)
  }
}

impl std::fmt::Display for ReadingError {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    match self {
      Self::InvalidEpub(path) => {
        write!(f, "файл {} не является корректным EPUB", path.display())
      }
      Self::Io(err) => write!(f, "ошибка ввода-вывода: {err}"),
    }
  }
}

impl std::error::Error for ReadingError {
  fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
    match self {
      Self::InvalidEpub(_) => None,
      Self::Io(err) => Some(err),
    }
  }
}