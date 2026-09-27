//! Тесты сканирования директории книг generic-источника.
//!
//! Сканер в WASM-окружении работает через host-функции, поэтому в нативных
//! тестах вместо них используется `TestFs` — локальное чтение временной папки
//! через ту же абстракцию `Fs`.

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

use super::{book_from_file, list_files, probe, PROBE_PRIORITY};
use crate::test_fs::TestFs;

/// Счётчик для уникальных имён временных папок каждого теста.
static NEXT_ROOT: AtomicU64 = AtomicU64::new(0);

/// Создание уникальной временной папки для теста.
fn test_root() -> PathBuf {
    let seed = NEXT_ROOT.fetch_add(1, Ordering::Relaxed);
    std::env::temp_dir().join(format!("library-test-{seed}"))
}

/// Каждый файл книги становится отдельной записью, включая вложенные папки.
#[test]
fn lists_nested_book_files_as_separate_entries() {
    let root = test_root();
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join("a").join("b")).expect("создание папок");
    fs::write(root.join("a").join("b").join("Первый.epub"), "epub").expect("книга");
    fs::write(root.join("Второй.pdf"), "pdf").expect("книга");
    fs::write(root.join("notes.md"), "заметки").expect("шум");

    let files = list_files(&TestFs::new(root)).expect("обход");

    assert_eq!(files.len(), 2, "найдены обе книги");
    let paths = files
        .iter()
        .map(|file| file.path.clone())
        .collect::<Vec<_>>();
    assert!(paths.contains(&"a/b/Первый.epub".to_string()));
    assert!(paths.contains(&"Второй.pdf".to_string()));
}

/// Метаданные файла отдаются без чтения содержимого.
#[test]
fn list_reports_file_size_and_mtime() {
    let root = test_root();
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("создание корня");
    fs::write(root.join("Книга.pdf"), vec![0u8; 7]).expect("книга");

    let files = list_files(&TestFs::new(root)).expect("обход");

    assert_eq!(files.len(), 1);
    assert_eq!(files[0].size, Some(7));
    assert!(files[0].mtime_ms.is_some(), "время изменения доступно");
    assert_eq!(files[0].format, "pdf");
}

/// Название берётся из имени файла, автора и обложки нет.
#[test]
fn book_has_no_author_and_no_cover() {
    let root = test_root();
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("создание корня");
    fs::write(root.join("Название книги.fb2"), "fb2").expect("книга");

    let book = book_from_file(&TestFs::new(root), "Название книги.fb2");

    assert_eq!(book.title, "Название книги");
    assert!(book.authors.is_empty());
    assert_eq!(book.files.len(), 1);
    assert_eq!(book.files[0].format, "fb2");
}

/// Скрытые папки и элементы пропускаются.
#[test]
fn skips_hidden_entries() {
    let root = test_root();
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join(".hidden")).expect("скрытая папка");
    fs::write(root.join(".hidden").join("Скрытая.epub"), "epub").expect("книга");
    fs::write(root.join(".secret.epub"), "epub").expect("скрытый файл");

    let files = list_files(&TestFs::new(root)).expect("обход");

    assert!(files.is_empty());
}

/// Probe находит книгу во вложенной папке.
#[test]
fn probe_detects_book_in_nested_folder() {
    let root = test_root();
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join("level").join("deep")).expect("папки");
    fs::write(root.join("level").join("deep").join("book.epub"), "epub").expect("книга");

    assert_eq!(
        probe(&TestFs::new(root)).expect("проверка"),
        Some(PROBE_PRIORITY)
    );
}

/// Generic-источник подтверждает любую директорию, включая пустую.
#[test]
fn probe_confirms_any_directory() {
    let root = test_root();
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join("Папка")).expect("папка");
    fs::write(root.join("readme.log"), "текст").expect("файл");
    fs::write(root.join("Папка").join("notes.md"), "заметки").expect("файл");

    assert_eq!(
        probe(&TestFs::new(root)).expect("проверка"),
        Some(PROBE_PRIORITY),
        "generic-источник — базовый и подтверждает любую директорию"
    );
}
