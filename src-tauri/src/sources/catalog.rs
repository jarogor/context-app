//! Построение виртуального SQLite-каталога для внешнего источника.

use rusqlite::Connection;
use sha2::{Digest, Sha256};
use std::path::Path;

use crate::catalog::{self, repository, FileKind, NewBook, NewFile};
use crate::library::LibraryError;

use super::models::{ExternalBook, ExternalFileKind};

/// Построение каталога в памяти по загруженному индексу.
pub(crate) fn build_catalog_from_index(
    index: &super::index::LibraryIndex,
) -> Result<Connection, LibraryError> {
    build_catalog_from_books(index.external_books())
}

/// Открытие ранее сохранённого SQLite-каталога.
///
/// Возвращает `None`, если файла каталога нет.
pub(crate) fn open_cached_catalog(path: &Path) -> Result<Option<Connection>, LibraryError> {
    if !path.is_file() {
        return Ok(None);
    }
    let mut connection = Connection::open(path)?;
    catalog::open_catalog(&mut connection)?;
    Ok(Some(connection))
}

/// Построение файлового каталога по книгам внешнего источника.
///
/// Запись выполняется во временный файл с последующим переименованием,
/// чтобы не оставить частично записанный каталог.
pub(crate) fn build_catalog_at(
    path: &Path,
    books: Vec<ExternalBook>,
) -> Result<Connection, LibraryError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let temporary = path.with_extension("db.tmp");
    let _ = std::fs::remove_file(&temporary);
    let mut connection = Connection::open(&temporary)?;
    catalog::open_catalog(&mut connection)?;
    save_external_books(&mut connection, books)?;
    drop(connection);
    std::fs::rename(&temporary, path)?;
    let mut connection = Connection::open(path)?;
    catalog::open_catalog(&mut connection)?;
    Ok(connection)
}

/// Построение каталога в памяти по книгам внешнего источника.
pub(crate) fn build_catalog_from_books(
    books: Vec<ExternalBook>,
) -> Result<Connection, LibraryError> {
    let mut connection = Connection::open_in_memory()?;
    catalog::open_catalog(&mut connection)?;
    save_external_books(&mut connection, books)?;
    Ok(connection)
}

/// Сохранение книг внешнего источника в каталог одним пакетом.
fn save_external_books(
    connection: &mut Connection,
    books: Vec<ExternalBook>,
) -> Result<(), LibraryError> {
    let books = books.into_iter().map(|book| {
        let files: Vec<NewFile> = book
            .files
            .into_iter()
            .map(|file| NewFile {
                kind: match file.kind {
                    ExternalFileKind::Book => FileKind::Book,
                    ExternalFileKind::Cover => FileKind::Cover,
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

/// Стабильный идентификатор книги по пути её файла.
///
/// Ограничивается диапазоном безопасных чисел JavaScript, чтобы идентификатор
/// не терял точность на фронтенде.
fn stable_id(path: &str) -> i64 {
    let digest = Sha256::digest(path.as_bytes());
    let mut bytes = [0_u8; 8];
    bytes.copy_from_slice(&digest[..8]);
    (i64::from_be_bytes(bytes) & 9_007_199_254_740_991).max(1)
}

#[cfg(test)]
#[path = "catalog_tests.rs"]
mod tests;
