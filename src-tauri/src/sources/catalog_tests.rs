//! Тесты построения виртуального каталога внешнего источника.

use std::path::PathBuf;

use super::build_catalog_from_books;
use crate::catalog::repository;
use crate::sources::models::{ExternalBook, ExternalFile, ExternalFileKind};
use crate::test_util;

/// Создание книги источника с файлом содержимого и обложкой.
fn catalog_book() -> ExternalBook {
    ExternalBook {
        title: "Каталог".to_string(),
        authors: vec!["Автор OPF".to_string()],
        tags: Vec::new(),
        series: Vec::new(),
        files: vec![
            ExternalFile {
                kind: ExternalFileKind::Book,
                path: PathBuf::from("Автор/Книга (11)/book.epub"),
                format: "epub".to_string(),
            },
            ExternalFile {
                kind: ExternalFileKind::Cover,
                path: PathBuf::from("Автор/Книга (11)/cover.jpg"),
                format: "jpg".to_string(),
            },
        ],
    }
}

/// Каталог сохраняет книги с путями файлов относительно корня библиотеки.
#[test]
fn builds_books_with_relative_paths() {
    let root = test_util::test_root("sources-catalog");
    test_util::cleanup(&root);
    let book = root.join("Автор").join("Книга (11)");
    std::fs::create_dir_all(&book).expect("создание папки книги");
    std::fs::write(book.join("book.epub"), "epub").expect("запись книги");
    std::fs::write(book.join("cover.jpg"), "cover").expect("запись обложки");

    let connection = build_catalog_from_books(vec![catalog_book()]).expect("построение каталога");
    let books = repository::list_books(&connection).expect("чтение каталога");

    assert_eq!(books.len(), 1);
    assert_eq!(books[0].authors[0].name, "Автор OPF");
    assert_eq!(books[0].title, "Каталог");
    assert_eq!(books[0].files[0].path, "Автор/Книга (11)/book.epub");
    assert!(books[0]
        .files
        .iter()
        .any(|file| file.kind == crate::catalog::FileKind::Cover));

    test_util::cleanup(&root);
}

/// Каталог из пустого набора книг пуст.
#[test]
fn builds_empty_catalog_for_empty_source() {
    let connection = build_catalog_from_books(Vec::new()).expect("построение каталога");
    let books = repository::list_books(&connection).expect("чтение каталога");
    assert!(books.is_empty());
}
