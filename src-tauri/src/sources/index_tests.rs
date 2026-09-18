//! Тесты локального индекса внешнего источника.

use std::fs;
use std::path::PathBuf;

use super::{index_path, LibraryIndex};
use crate::sources::models::{ExternalBook, ExternalFile, ExternalFileKind};
use crate::test_util;

/// Имя тестового плагина-источника.
const SOURCE: &str = "library-source";

/// Создание книги источника с одним файлом содержимого.
fn book(author: &str, title: &str, file: &str) -> ExternalBook {
    ExternalBook {
        title: title.to_string(),
        authors: vec![author.to_string()],
        tags: Vec::new(),
        series: Vec::new(),
        files: vec![ExternalFile {
            kind: ExternalFileKind::Book,
            path: PathBuf::from(format!("{author}/{title} ({file})/{file}.epub")),
            format: "epub".to_string(),
        }],
    }
}

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
    let book_dir = root.join("Автор").join("Книга (1)");
    fs::create_dir_all(&book_dir).expect("создание книги");
    fs::write(book_dir.join("book.epub"), "epub").expect("создание файла");
    let index =
        LibraryIndex::from_external(&root, SOURCE.to_string(), vec![book("Автор", "Книга", "1")]);
    let path = root.join("cache").join("index.json");
    index.save_atomic(&path).expect("сохранение индекса");
    let loaded = LibraryIndex::load(&path, &root)
        .expect("чтение индекса")
        .expect("индекс существует");
    assert_eq!(loaded.books.len(), 1);
    assert_eq!(loaded.external_books()[0].title, "Книга");
    fs::write(&path, "broken").expect("повреждение индекса");
    assert!(LibraryIndex::load(&path, &root).is_err());
    test_util::cleanup(&root);
}

/// Индекс без имени источника не считается совместимым.
#[test]
fn index_without_source_is_rejected() {
    let root = test_util::test_root("index-no-source");
    test_util::cleanup(&root);
    let book_dir = root.join("Автор").join("Книга (1)");
    fs::create_dir_all(&book_dir).expect("создание книги");
    fs::write(book_dir.join("book.epub"), "epub").expect("создание файла");
    let index =
        LibraryIndex::from_external(&root, String::new(), vec![book("Автор", "Книга", "1")]);
    assert!(
        !index.validate_root(&root),
        "индекс без источника несовместим"
    );
    test_util::cleanup(&root);
}

/// `filter_changed` реагирует только на реальные изменения содержимого.
#[test]
fn filter_changed_detects_only_real_changes() {
    let root = test_util::test_root("index-filter-changed");
    test_util::cleanup(&root);
    let first = root.join("Автор").join("Первая (first)");
    let second = root.join("Автор").join("Вторая (second)");
    fs::create_dir_all(&first).expect("создание первой книги");
    fs::create_dir_all(&second).expect("создание второй книги");
    fs::write(first.join("first.epub"), "first").expect("первая книга");
    fs::write(second.join("second.epub"), "second").expect("вторая книга");
    let books = vec![
        book("Автор", "Первая", "first"),
        book("Автор", "Вторая", "second"),
    ];
    let index = LibraryIndex::from_external(&root, SOURCE.to_string(), books);

    let unchanged: std::collections::HashSet<_> =
        [first.clone(), second.clone()].into_iter().collect();
    assert!(
        index.filter_changed(&root, &unchanged).is_empty(),
        "без изменений содержимого переиндексация не требуется"
    );

    fs::write(first.join("first.epub"), "first-modified-longer").expect("изменение книги");
    let changed = index.filter_changed(&root, &unchanged);
    assert_eq!(changed.len(), 1);
    assert!(changed.contains(&first));

    let new_book = root.join("Автор").join("Новая (new)");
    fs::create_dir_all(&new_book).expect("создание новой книги");
    fs::write(new_book.join("new.epub"), "new").expect("новая книга");
    let candidates: std::collections::HashSet<_> = [new_book.clone()].into_iter().collect();
    assert_eq!(
        index.filter_changed(&root, &candidates),
        candidates,
        "новая папка книги считается изменением"
    );

    test_util::cleanup(&root);
}

/// `from_external` восстанавливает книги источника из сохранённого индекса.
#[test]
fn rebuilds_external_books_from_index() {
    let root = test_util::test_root("index-external-books");
    test_util::cleanup(&root);
    let book_dir = root.join("Автор").join("Книга (7)");
    fs::create_dir_all(&book_dir).expect("создание книги");
    fs::write(book_dir.join("book.epub"), "epub").expect("создание файла");
    fs::write(book_dir.join("cover.jpg"), "cover").expect("создание обложки");
    let books = vec![ExternalBook {
        title: "Книга".to_string(),
        authors: vec!["Автор".to_string()],
        tags: Vec::new(),
        series: Vec::new(),
        files: vec![
            ExternalFile {
                kind: ExternalFileKind::Book,
                path: PathBuf::from("Автор/Книга (7)/book.epub"),
                format: "epub".to_string(),
            },
            ExternalFile {
                kind: ExternalFileKind::Cover,
                path: PathBuf::from("Автор/Книга (7)/cover.jpg"),
                format: "jpg".to_string(),
            },
        ],
    }];
    let index = LibraryIndex::from_external(&root, SOURCE.to_string(), books);
    let restored = index.external_books();
    assert_eq!(restored.len(), 1);
    assert_eq!(restored[0].files.len(), 2);
    assert!(restored[0]
        .files
        .iter()
        .any(|file| file.kind == ExternalFileKind::Cover));
    test_util::cleanup(&root);
}
