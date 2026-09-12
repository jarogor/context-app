//! Приватные DTO модуля импорта.

/// Хранилище данных импортированной книги на диске.
pub(super) struct WrittenFiles {
    pub book_relative_path: String,
    pub cover_relative_path: Option<String>,
    pub cover_format: Option<String>,
}
