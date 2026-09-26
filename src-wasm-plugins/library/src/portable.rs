//! Портируемый режим библиотеки: импорт книги в собственное хранилище.
//!
//! Логика не зависит от целевой архитектуры и покрывается нативными тестами.

use super::epub;
use super::fs::Fs;
use super::lifecycle;
use super::models::{
    ExternalBook, ExternalFile, ExternalFileKind, SourceCatalog, SOURCE_PROTOCOL_VERSION,
};

/// Импорт выбранного EPUB в портируемую библиотеку с обновлением каталога.
pub(crate) fn import_book(fs: &impl Fs, path: &str) -> Result<ExternalBook, String> {
    let bytes = fs.import_read_bytes(path)?;
    let (title, authors) = epub::parse_epub_metadata(&bytes)?;
    let id = format!("portable/{title}");
    let book_path = format!("books/{}.epub", sanitize_name(&title));
    let book = ExternalBook {
        id: id.clone(),
        title,
        authors,
        tags: Vec::new(),
        series: Vec::new(),
        files: vec![ExternalFile {
            kind: ExternalFileKind::Book,
            path: book_path.clone(),
            format: "epub".to_string(),
        }],
    };
    fs.write_bytes(&book_path, &bytes)?;
    let mut catalog = lifecycle::catalog().unwrap_or(SourceCatalog {
        protocol_version: SOURCE_PROTOCOL_VERSION,
        revision: 0,
        books: Vec::new(),
    });
    catalog.books.retain(|current| current.id != id);
    catalog.books.push(book.clone());
    lifecycle::replace(fs, catalog)?;
    Ok(book)
}

/// Нормализация имени файла в portable storage.
pub(crate) fn sanitize_name(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character
            } else {
                '_'
            }
        })
        .collect()
}

#[cfg(test)]
#[path = "portable_tests.rs"]
mod tests;
