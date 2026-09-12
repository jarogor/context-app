//! Метаданные, извлечённые из EPUB-файла.

/// Извлечённые из EPUB метаданные книги.
pub struct ExtractedMetadata {
    pub title: Option<String>,
    pub authors: Vec<String>,
    pub cover: Option<CoverData>,
}

/// Данные обложки, извлечённой из EPUB.
pub struct CoverData {
    pub bytes: Vec<u8>,
    pub format: String,
}
