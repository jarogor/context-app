//! Построение виртуального SQLite-каталога для Calibre.

use rusqlite::Connection;
use sha2::{Digest, Sha256};
use std::path::Path;

use crate::catalog::{self, repository, FileKind, NewBook, NewFile};
use crate::library::LibraryError;

use super::scanner::{ScannedBook, ScannedFileKind};

pub(crate) fn build_catalog_from_index(
    index: &super::index::LibraryIndex,
) -> Result<Connection, LibraryError> {
    build_catalog_from_books(index.scanned_books())
}

pub(crate) fn open_cached_catalog(path: &Path) -> Result<Option<Connection>, LibraryError> {
    if !path.is_file() {
        return Ok(None);
    }
    let mut connection = Connection::open(path)?;
    catalog::open_catalog(&mut connection)?;
    Ok(Some(connection))
}

pub(crate) fn build_catalog_at(
    path: &Path,
    scanned: Vec<ScannedBook>,
) -> Result<Connection, LibraryError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let temporary = path.with_extension("db.tmp");
    let _ = std::fs::remove_file(&temporary);
    let mut connection = Connection::open(&temporary)?;
    catalog::open_catalog(&mut connection)?;
    save_scanned_books(&mut connection, scanned)?;
    drop(connection);
    std::fs::rename(&temporary, path)?;
    let mut connection = Connection::open(path)?;
    catalog::open_catalog(&mut connection)?;
    Ok(connection)
}

pub(crate) fn build_catalog_from_books(
    scanned: Vec<ScannedBook>,
) -> Result<Connection, LibraryError> {
    let mut connection = Connection::open_in_memory()?;
    catalog::open_catalog(&mut connection)?;
    save_scanned_books(&mut connection, scanned)?;
    Ok(connection)
}

fn save_scanned_books(
    connection: &mut Connection,
    scanned: Vec<ScannedBook>,
) -> Result<(), LibraryError> {
    let books = scanned.into_iter().map(|book| {
        let files: Vec<NewFile> = book
            .files
            .into_iter()
            .map(|file| NewFile {
                kind: match file.kind {
                    ScannedFileKind::Book => FileKind::Book,
                    ScannedFileKind::Cover => FileKind::Cover,
                },
                path: file.path.to_string_lossy().into_owned(),
                format: file.format,
            })
            .collect();
        let stable_id = files
            .iter()
            .find(|file| file.kind == FileKind::Book)
            .map(|file| stable_id(&file.path));
        NewBook {
            stable_id,
            title: book.title,
            authors: book.authors,
            series: book.series,
            tags: book.tags,
            files,
        }
    });
    repository::save_books(connection, books)?;
    Ok(())
}

fn stable_id(path: &str) -> i64 {
    let digest = Sha256::digest(path.as_bytes());
    let mut bytes = [0_u8; 8];
    bytes.copy_from_slice(&digest[..8]);
    (i64::from_be_bytes(bytes) & 9_007_199_254_740_991).max(1)
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::build_catalog_from_books;
    use crate::calibre::scanner;
    use crate::catalog::repository;
    use crate::test_util;

    #[test]
    fn builds_books_with_relative_paths() {
        let root = test_util::test_root("calibre-catalog");
        test_util::cleanup(&root);
        let book = root.join("Автор").join("Книга (11)");
        fs::create_dir_all(&book).expect("создание папки книги");
        fs::write(
            book.join("metadata.opf"),
            r#"<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata>
                <dc:title>Каталог</dc:title><dc:creator>Автор OPF</dc:creator>
            </metadata></package>"#,
        )
        .expect("запись OPF");
        fs::write(book.join("book.epub"), "epub").expect("запись книги");
        fs::write(book.join("cover.jpg"), "cover").expect("запись обложки");

        let connection = build_catalog_from_books(scanner::scan(&root).expect("сканирование"))
            .expect("построение каталога");
        let books = repository::list_books(&connection).expect("чтение каталога");

        assert_eq!(books.len(), 1);
        assert_eq!(books[0].authors[0].name, "Автор OPF");
        assert_eq!(books[0].files[0].path, "Автор/Книга (11)/book.epub");

        test_util::cleanup(&root);
    }
}
