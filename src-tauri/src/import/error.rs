//! Типы ошибок импорта книг.

use std::io;
use std::path::PathBuf;

use crate::catalog::CatalogError;
use crate::library::LibraryError;

/// Ошибка, возникающая при импорте книги.
#[derive(Debug)]
pub enum ImportError {
    /// Исходный файл не является корректным EPUB.
    InvalidEpub(PathBuf, String),
    /// Ошибка копирования файла.
    Io(io::Error),
    /// Ошибка слоя библиотеки.
    Library(LibraryError),
    /// Ошибка каталога.
    Catalog(CatalogError),
    /// Изменение внешней библиотеки запрещено.
    ReadOnly,
}

impl From<io::Error> for ImportError {
    /// Преобразование ошибки ввода-вывода в ошибку импорта.
    fn from(value: io::Error) -> Self {
        Self::Io(value)
    }
}

impl From<rusqlite::Error> for ImportError {
    /// Преобразование ошибки SQLite в ошибку импорта.
    fn from(value: rusqlite::Error) -> Self {
        Self::Catalog(CatalogError::Database(value))
    }
}

impl From<LibraryError> for ImportError {
    /// Преобразование ошибки библиотеки в ошибку импорта.
    fn from(value: LibraryError) -> Self {
        Self::Library(value)
    }
}

impl From<CatalogError> for ImportError {
    /// Преобразование ошибки каталога в ошибку импорта.
    fn from(value: CatalogError) -> Self {
        Self::Catalog(value)
    }
}

impl std::fmt::Display for ImportError {
    /// Форматирование ошибки для пользователя.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidEpub(path, reason) => {
                write!(
                    f,
                    "файл {} не является корректным EPUB: {reason}",
                    path.display()
                )
            }
            Self::Io(err) => write!(f, "ошибка ввода-вывода: {err}"),
            Self::Library(err) => write!(f, "ошибка библиотеки: {err}"),
            Self::Catalog(err) => write!(f, "ошибка каталога: {err}"),
            Self::ReadOnly => write!(f, "библиотека доступна только для чтения"),
        }
    }
}

impl std::error::Error for ImportError {
    /// Возврат исходной ошибки, если она есть.
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::InvalidEpub(_, _) => None,
            Self::Io(err) => Some(err),
            Self::Library(err) => Some(err),
            Self::Catalog(err) => Some(err),
            Self::ReadOnly => None,
        }
    }
}
