//! Приватные DTO модуля импорта.

/// Хранилище данных импортированной книги на диске.
pub(super) struct WrittenFiles {
    /// Относительный путь к скопированному файлу книги.
    pub book_relative_path: String,
    /// Относительный путь к файлу обложки, если он есть.
    pub cover_relative_path: Option<String>,
    /// Расширение файла обложки, если он есть.
    pub cover_format: Option<String>,
}
