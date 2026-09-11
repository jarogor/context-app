//! Извлечение базовых метаданных из файлов EPUB.
//!
//! Модуль инкапсулирует разбор EPUB: название, список авторов и обложку.

use std::path::Path;

use crate::library::LibraryError;

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

/// Извлечение метаданных из файла EPUB.
///
/// Возвращает `None` для отсутствующих значений; повреждённый файл
/// приводит к ошибке.
pub fn extract_metadata(
    epub_path: &Path,
) -> Result<ExtractedMetadata, LibraryError> {
    let doc = epub::doc::EpubDoc::new(epub_path).map_err(|_| {
        LibraryError::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("не удалось разобрать EPUB: {}", epub_path.display()),
        ))
    })?;

    let title = doc.get_title();

    let authors = doc
        .metadata
        .iter()
        .filter(|item| item.property == "creator")
        .map(|item| item.value.clone())
        .collect::<Vec<_>>();

    let mut doc = doc;
    let cover = match doc.get_cover() {
        Some((bytes, mime)) => {
            let format = mime_to_extension(&mime).to_string();
            Some(CoverData { bytes, format })
        }
        None => None,
    };

    Ok(ExtractedMetadata {
        title,
        authors,
        cover,
    })
}

/// Соответствие MIME-типа обложки расширению файла.
fn mime_to_extension(mime: &str) -> &'static str {
    match mime {
        "image/png" => "png",
        "image/gif" => "gif",
        "image/webp" => "webp",
        _ => "jpg",
    }
}