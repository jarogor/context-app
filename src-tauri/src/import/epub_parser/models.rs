//! Метаданные, извлечённые из EPUB-файла.

/// Извлечённые из EPUB метаданные книги.
pub struct ExtractedMetadata {
    /// Название книги, если найдено в файле.
    pub title: Option<String>,
    /// Авторы книги.
    pub authors: Vec<String>,
    /// Обложка книги, если найдена.
    pub cover: Option<CoverData>,
}

/// Данные обложки, извлечённой из EPUB.
pub struct CoverData {
    /// Байты изображения обложки.
    pub bytes: Vec<u8>,
    /// Расширение файла обложки.
    pub format: String,
}
