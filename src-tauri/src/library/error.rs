//! Типы ошибок слоя портируемой библиотеки.

use std::io;
use std::path::PathBuf;

use crate::catalog::CatalogError;

/// Ошибка, возникающая при работе с портируемой директорией библиотеки.
#[derive(Debug)]
pub enum LibraryError {
    /// Указанный путь не является директорией.
    NotADirectory(PathBuf),
    /// Ошибка файловой операции.
    Io(io::Error),
    /// Ошибка при работе с базой данных.
    Database(rusqlite::Error),
    /// Ошибка заполнения каталога.
    Catalog(CatalogError),
    /// Ошибка наблюдения за файловой системой.
    Watcher(String),
}

impl From<io::Error> for LibraryError {
    /// Преобразование ошибки ввода-вывода в ошибку библиотеки.
    fn from(value: io::Error) -> Self {
        Self::Io(value)
    }
}

impl From<rusqlite::Error> for LibraryError {
    /// Преобразование ошибки SQLite в ошибку библиотеки.
    fn from(value: rusqlite::Error) -> Self {
        Self::Database(value)
    }
}

impl From<CatalogError> for LibraryError {
    /// Преобразование ошибки каталога в ошибку библиотеки.
    fn from(value: CatalogError) -> Self {
        Self::Catalog(value)
    }
}

impl From<notify::Error> for LibraryError {
    /// Преобразование ошибки наблюдателя в ошибку библиотеки.
    fn from(value: notify::Error) -> Self {
        Self::Watcher(value.to_string())
    }
}

impl std::fmt::Display for LibraryError {
    /// Форматирование ошибки для пользователя.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotADirectory(path) => {
                write!(f, "путь не является директорией: {}", path.display())
            }
            Self::Io(err) => write!(f, "ошибка ввода-вывода: {err}"),
            Self::Database(err) => write!(f, "ошибка базы данных: {err}"),
            Self::Catalog(err) => write!(f, "ошибка каталога: {err}"),
            Self::Watcher(err) => write!(f, "ошибка наблюдения за библиотекой: {err}"),
        }
    }
}

impl std::error::Error for LibraryError {
    /// Возврат исходной ошибки, если она есть.
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::NotADirectory(_) => None,
            Self::Io(err) => Some(err),
            Self::Database(err) => Some(err),
            Self::Catalog(err) => Some(err),
            Self::Watcher(_) => None,
        }
    }
}
