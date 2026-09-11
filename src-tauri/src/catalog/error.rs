//! Типы ошибок каталога.

/// Ошибка, возникающая при работе с каталогом книг.
#[derive(Debug)]
pub enum CatalogError {
    /// Запись не найдена в базе данных.
    NotFound,
    /// Ошибка базы данных.
    Database(rusqlite::Error),
}

impl From<rusqlite::Error> for CatalogError {
    fn from(value: rusqlite::Error) -> Self {
        Self::Database(value)
    }
}

impl std::fmt::Display for CatalogError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotFound => write!(f, "запись не найдена"),
            Self::Database(err) => write!(f, "ошибка базы данных: {err}"),
        }
    }
}

impl std::error::Error for CatalogError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::NotFound => None,
            Self::Database(err) => Some(err),
        }
    }
}
