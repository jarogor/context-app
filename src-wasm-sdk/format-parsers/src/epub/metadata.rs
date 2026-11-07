//! Извлечение метаданных EPUB: название, авторы, обложка и свойства издания.

use std::io::Cursor;

use zip::ZipArchive;

use super::archive::{epub_cover, read_zip_entry, rootfile_path};
use crate::xml::{all_text_between, strip_markup, text_between};
use source_protocol::models::BookMetadata;

/// Извлечение метаданных (название, авторы, обложка, свойства) из EPUB.
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
        language: non_empty(text_between(&opf, "dc:language")),
        published: non_empty(text_between(&opf, "dc:date")),
        publisher: non_empty(text_between(&opf, "dc:publisher")),
        description: non_empty(
            text_between(&opf, "dc:description").map(|value| strip_markup(&value)),
        ),
        identifier: identifier_from(all_text_between(&opf, "dc:identifier")),
    })
}

/// Значение, если после обрезки оно не пустое.
fn non_empty(value: Option<String>) -> Option<String> {
    value.filter(|text| !text.trim().is_empty())
}

/// Идентификатор издания из значений `dc:identifier`: предпочитается ISBN.
fn identifier_from(values: Vec<String>) -> Option<String> {
    let mut fallback = None;
    for value in values {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed.to_ascii_lowercase().contains("isbn") {
            return Some(trimmed.to_string());
        }
        if fallback.is_none() {
            fallback = Some(trimmed.to_string());
        }
    }
    fallback
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
