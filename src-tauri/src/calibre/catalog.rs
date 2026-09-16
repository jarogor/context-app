//! Построение виртуального SQLite-каталога для Calibre.

use std::path::Path;

use rusqlite::Connection;

use crate::catalog::{self, repository, FileKind, NewBook, NewFile};
use crate::library::LibraryError;

use super::scanner::{self, ScannedFileKind};

pub(crate) fn build_virtual_catalog(root: &Path) -> Result<Connection, LibraryError> {
    let mut connection = Connection::open_in_memory()?;
    catalog::open_catalog(&mut connection)?;
    let scanned = scanner::scan(root)?;
    for book in scanned {
        let files = book
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
        repository::save_book(
            &mut connection,
            NewBook {
                title: book.title,
                authors: book.authors,
                series: book.series,
                tags: book.tags,
                files,
            },
        )?;
    }
    Ok(connection)
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::build_virtual_catalog;
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

        let connection = build_virtual_catalog(&root).expect("построение каталога");
        let books = repository::list_books(&connection).expect("чтение каталога");

        assert_eq!(books.len(), 1);
        assert_eq!(books[0].authors[0].name, "Автор OPF");
        assert_eq!(books[0].files[0].path, "Автор/Книга (11)/book.epub");

        test_util::cleanup(&root);
    }
}
