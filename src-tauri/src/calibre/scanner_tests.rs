//! Тесты сканирования файловой структуры Calibre.

use std::fs;

use super::scan;
use crate::calibre::models::ScannedFileKind;
use crate::test_util;

/// Сканирование находит книгу и игнорирует корневой шум.
#[test]
fn scans_books_and_ignores_root_noise() {
    let root = test_util::test_root("calibre-scan");
    test_util::cleanup(&root);
    let book = root.join("Автор").join("Название (42)");
    fs::create_dir_all(&book).expect("создание папки книги");
    fs::write(book.join("metadata.opf"), "<package><metadata/></package>").expect("запись OPF");
    fs::write(book.join("book.epub"), "epub").expect("запись книги");
    fs::write(book.join("cover.jpg"), "cover").expect("запись обложки");
    fs::write(root.join("metadata.db"), "noise").expect("запись шума");
    fs::create_dir_all(root.join(".hidden")).expect("создание скрытой папки");

    let books = scan(&root).expect("сканирование");

    assert_eq!(books.len(), 1);
    assert_eq!(books[0].title, "Название");
    assert_eq!(books[0].authors, ["Автор"]);
    assert_eq!(books[0].files.len(), 2);

    test_util::cleanup(&root);
}

/// Обложка берётся из OPF, если файла `cover.*` в папке нет.
#[test]
fn uses_cover_declared_in_opf_when_default_cover_is_missing() {
    let root = test_util::test_root("calibre-opf-cover");
    test_util::cleanup(&root);
    let book = root.join("Автор").join("Книга (8)");
    fs::create_dir_all(&book).expect("создание папки книги");
    fs::write(
        book.join("metadata.opf"),
        r#"<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata>
                <dc:title>Книга</dc:title><meta name="cover" content="front.png"/>
            </metadata></package>"#,
    )
    .expect("запись OPF");
    fs::write(book.join("book.epub"), "epub").expect("запись книги");
    fs::write(book.join("front.png"), "cover").expect("запись обложки");

    let books = scan(&root).expect("сканирование");

    assert_eq!(books.len(), 1);
    assert_eq!(books[0].files.len(), 2);
    assert!(books[0]
        .files
        .iter()
        .any(|file| matches!(file.kind, ScannedFileKind::Cover)));

    test_util::cleanup(&root);
}

/// При повреждённом OPF данные берутся из имени папки.
#[test]
fn falls_back_to_folder_metadata_when_opf_is_invalid() {
    let root = test_util::test_root("calibre-invalid-opf");
    test_util::cleanup(&root);
    let book = root.join("Автор").join("Название (9)");
    fs::create_dir_all(&book).expect("создание папки книги");
    fs::write(book.join("metadata.opf"), "<package>").expect("запись повреждённого OPF");
    fs::write(book.join("book.epub"), "epub").expect("запись книги");

    let books = scan(&root).expect("сканирование");

    assert_eq!(books[0].title, "Название");
    assert_eq!(books[0].authors, ["Автор"]);
    test_util::cleanup(&root);
}

/// Сканирование находит несколько авторов и книг.
#[test]
fn scans_multiple_authors_and_books() {
    let root = test_util::test_root("calibre-multiple-books");
    test_util::cleanup(&root);
    for (author, title) in [
        ("Автор 1", "Книга 1"),
        ("Автор 1", "Книга 2"),
        ("Автор 2", "Книга 3"),
    ] {
        let book = root.join(author).join(format!("{title} (1)"));
        fs::create_dir_all(&book).expect("создание папки книги");
        fs::write(book.join("book.epub"), "epub").expect("запись книги");
    }

    let books = scan(&root).expect("сканирование");

    assert_eq!(books.len(), 3);
    test_util::cleanup(&root);
}
