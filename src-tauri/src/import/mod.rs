//! Импорт книг в библиотеку.
//!
//! Сервис оркеструет разбор EPUB, запись метаданных и копирование файлов
//! в портируемую директорию. Импорт атомаре́н по отношению к базе данных:
//! повреждённый файл отклоняется до внесения изменений.

pub mod epub_parser;
pub mod error;
mod models;

use std::fs;
use std::path::{Path, PathBuf};

use crate::catalog::repository::{get_or_create_author, insert_book, insert_file, link_authors};
use crate::catalog::{CatalogError, FileKind};
use crate::library::Library;

use self::epub_parser::extract_metadata;
use self::error::ImportError;
use self::models::WrittenFiles;

/// Импорт книги в библиотеку из файла EPUB.
///
/// Парсинг выполняется до записи в базу; при ошибке разбора файл не
/// попадает в библиотеку и записи не создаются.
pub fn import_book(
    library: &mut Library,
    source_path: &Path,
) -> Result<crate::catalog::Book, ImportError> {
    let metadata = extract_metadata(source_path)?;

    let title = metadata
        .title
        .clone()
        .filter(|t| !t.trim().is_empty())
        .unwrap_or_else(|| title_from_filename(source_path));

    let books_dir_abs = library.books_dir_abs();
    let covers_dir_abs = library.covers_dir_abs();
    let books_dir = library.books_dir().to_string();
    let covers_dir = library.covers_dir().to_string();

    let connection = library.connection_mut();
    let transaction = connection.transaction()?;

    let uuid = uuid::Uuid::new_v4().to_string();
    let book_id = insert_book(&transaction, &uuid, &title)?;

    let author_ids = metadata
        .authors
        .iter()
        .map(|name| get_or_create_author(&transaction, name))
        .collect::<Result<Vec<_>, _>>()?;
    link_authors(&transaction, book_id, &author_ids)?;

    let written = write_book_files(
        &books_dir_abs,
        &covers_dir_abs,
        &books_dir,
        &covers_dir,
        book_id,
        source_path,
        &metadata,
    )?;

    insert_file(
        &transaction,
        book_id,
        FileKind::Book,
        &written.book_relative_path,
        "epub",
    )?;
    if let (Some(cover_path), Some(cover_format)) =
        (&written.cover_relative_path, &written.cover_format)
    {
        insert_file(
            &transaction,
            book_id,
            FileKind::Cover,
            cover_path,
            cover_format,
        )?;
    }

    transaction.commit()?;

    crate::catalog::repository::get_book(connection, book_id)
        .map_err(ImportError::Catalog)?
        .ok_or_else(|| ImportError::Catalog(CatalogError::NotFound))
}

/// Название книги по имени исходного файла (для EPUB без метаданных).
fn title_from_filename(source_path: &Path) -> String {
    source_path
        .file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Без названия".to_string())
}

/// Копирование файла книги и обложки в портируемую директорию.
///
/// Имена файлов уникальны за счёт префикса `book_id`.
fn write_book_files(
    books_dir_abs: &Path,
    covers_dir_abs: &Path,
    books_dir: &str,
    covers_dir: &str,
    book_id: i64,
    source_path: &Path,
    metadata: &epub_parser::ExtractedMetadata,
) -> Result<WrittenFiles, ImportError> {
    let book_file_name = format!("{book_id}.epub");
    let book_dest = books_dir_abs.join(&book_file_name);
    fs::copy(source_path, &book_dest)?;

    let mut cover_relative_path = None;
    let mut cover_format = None;
    if let Some(cover) = &metadata.cover {
        let cover_file_name = format!("{book_id}.{}", cover.format);
        let cover_dest = covers_dir_abs.join(&cover_file_name);
        fs::write(&cover_dest, &cover.bytes)?;
        cover_relative_path = Some(
            PathBuf::from(covers_dir)
                .join(&cover_file_name)
                .to_string_lossy()
                .into_owned(),
        );
        cover_format = Some(cover.format.clone());
    }

    Ok(WrittenFiles {
        book_relative_path: PathBuf::from(books_dir)
            .join(&book_file_name)
            .to_string_lossy()
            .into_owned(),
        cover_relative_path,
        cover_format,
    })
}

#[cfg(test)]
#[path = "_tests.rs"]
mod tests;
