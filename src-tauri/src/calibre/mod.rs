//! Чтение внешней библиотеки Calibre.

pub(crate) mod catalog;
pub(crate) mod index;
pub(crate) mod metadata;
pub(crate) mod scanner;

use std::fs;
use std::path::Path;

/// Проверка типовой структуры Calibre без полного сканирования библиотеки.
pub(crate) fn looks_like_library(root: &Path) -> bool {
    if root.join("metadata.db").is_file() {
        return true;
    }

    let Ok(authors) = fs::read_dir(root) else {
        return false;
    };

    authors.flatten().any(|author| {
        if !author.path().is_dir() || is_hidden(author.file_name().as_encoded_bytes()) {
            return false;
        }
        let Ok(books) = fs::read_dir(author.path()) else {
            return false;
        };
        books
            .flatten()
            .any(|book| book.path().is_dir() && book.path().join("metadata.opf").is_file())
    })
}

fn is_hidden(name: &[u8]) -> bool {
    name.first() == Some(&b'.')
}
