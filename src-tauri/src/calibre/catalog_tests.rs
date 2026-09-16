//! Тесты построения виртуального каталога Calibre.

use std::fs;

use super::build_catalog_from_books;
use crate::calibre::scanner;
use crate::catalog::repository;
use crate::test_util;

/// Каталог сохраняет книги с путями файлов относительно корня библиотеки.
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
