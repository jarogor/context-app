//! Тесты локального индекса внешней библиотеки Calibre.

use std::fs;

use super::{index_path, LibraryIndex};
use crate::calibre::scanner;
use crate::test_util;

/// Для одного и того же корня путь индекса стабилен и лежит в `.booklib`.
#[test]
fn uses_stable_hash_for_same_root() {
    let root = test_util::test_root("index-path");
    assert_eq!(index_path(&root), index_path(&root));
    assert!(index_path(&root).to_string_lossy().contains(".booklib"));
}

/// Индекс сохраняется и загружается; повреждённый JSON даёт ошибку.
#[test]
fn saves_and_loads_index_atomically() {
    let root = test_util::test_root("index-roundtrip");
    test_util::cleanup(&root);
    let book = root.join("Автор").join("Книга (1)");
    fs::create_dir_all(&book).expect("создание книги");
    fs::write(book.join("book.epub"), "epub").expect("создание файла");
    let index = LibraryIndex::from_scanned(&root, scanner::scan(&root).expect("сканирование"));
    let path = root.join("cache").join("index.json");
    index.save_atomic(&path).expect("сохранение индекса");
    let loaded = LibraryIndex::load(&path, &root)
        .expect("чтение индекса")
        .expect("индекс существует");
    assert_eq!(loaded.books.len(), 1);
    fs::write(&path, "broken").expect("повреждение индекса");
    assert!(LibraryIndex::load(&path, &root).is_err());
    test_util::cleanup(&root);
}

/// Частичное обновление заменяет только изменённую папку книги.
#[test]
fn replaces_only_changed_book_directory() {
    let root = test_util::test_root("index-partial-update");
    test_util::cleanup(&root);
    let first = root.join("Автор").join("Первая (1)");
    let second = root.join("Автор").join("Вторая (2)");
    fs::create_dir_all(&first).expect("создание первой книги");
    fs::create_dir_all(&second).expect("создание второй книги");
    fs::write(first.join("first.epub"), "first").expect("первая книга");
    fs::write(second.join("second.epub"), "second").expect("вторая книга");
    let mut index =
        LibraryIndex::from_scanned(&root, scanner::scan(&root).expect("первичное сканирование"));
    fs::remove_file(first.join("first.epub")).expect("удаление первой книги");
    fs::write(first.join("replacement.epub"), "replacement").expect("новый файл");
    let changed = index.changed_directories(&root);
    index
        .replace_directories(&root, &changed)
        .expect("частичное обновление");
    assert_eq!(index.books.len(), 2);
    assert!(index.books.iter().any(|book| {
        book.files
            .iter()
            .any(|file| file.path.ends_with("replacement.epub"))
    }));
    test_util::cleanup(&root);
}
