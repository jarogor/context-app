//! Извлечение метаданных EPUB: название, авторы, обложка.

use std::io::Cursor;

use zip::ZipArchive;

use super::archive::{epub_cover, read_zip_entry, rootfile_path};
use crate::xml::{all_text_between, text_between};
use source_protocol::models::BookMetadata;

/// Извлечение метаданных (название, авторы, обложка) из содержимого EPUB.
pub fn extract(bytes: &[u8]) -> Result<BookMetadata, String> {
    let mut archive =
        ZipArchive::new(Cursor::new(bytes)).map_err(|_| "не удалось открыть EPUB".to_string())?;
    let rootfile = rootfile_path(&mut archive)?;
    let opf = read_zip_entry(&mut archive, &rootfile)?;
    let title = text_between(&opf, "dc:title").filter(|value| !value.is_empty());
    let authors = all_text_between(&opf, "dc:creator")
        .into_iter()
        .filter(|value| !value.is_empty())
        .collect();
    let cover = epub_cover(&mut archive, &opf, &rootfile);
    Ok(BookMetadata {
        title,
        authors,
        cover,
    })
}

/// Извлечение названия и авторов из метаданных EPUB.
pub fn parse_epub_metadata(bytes: &[u8]) -> Result<(String, Vec<String>), String> {
    let mut archive =
        ZipArchive::new(Cursor::new(bytes)).map_err(|_| "не удалось открыть EPUB".to_string())?;
    let rootfile = rootfile_path(&mut archive)?;
    let opf_text = read_zip_entry(&mut archive, &rootfile)?;
    let title = text_between(&opf_text, "dc:title").unwrap_or_else(|| "Без названия".to_string());
    let authors = all_text_between(&opf_text, "dc:creator");
    Ok((title, authors))
}
