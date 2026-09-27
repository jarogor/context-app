//! Тесты локального SQLite-индекса библиотеки Calibre.
//!
//! Индекс в WASM-окружении работает через SQL host-функции; в нативных тестах
//! SQL исполняет `TestFs` настоящим SQLite, а число прочитанных файлов
//! показывает инкрементальность.

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

use super::{load_cover, sync};
use crate::test_fs::TestFs;

/// Счётчик для уникальных имён временных папок каждого теста.
static NEXT_ROOT: AtomicU64 = AtomicU64::new(0);

/// Создание уникальной временной папки для теста.
fn test_root() -> PathBuf {
    let seed = NEXT_ROOT.fetch_add(1, Ordering::Relaxed);
    std::env::temp_dir().join(format!("calibre-index-{seed}"))
}

/// Создание корня библиотеки с одной книгой и `metadata.opf`.
fn prepare_book(title: &str) -> PathBuf {
    let root = test_root();
    let _ = fs::remove_dir_all(&root);
    let book = root.join("Автор").join("Папка");
    fs::create_dir_all(&book).expect("папка книги");
    fs::write(book.join("book.epub"), "epub").expect("книга");
    write_opf(&book, title);
    root
}

/// Запись `metadata.opf` с заданным названием.
fn write_opf(book: &std::path::Path, title: &str) {
    let xml = format!(
        "<?xml version='1.0'?><package xmlns:dc=\"http://purl.org/dc/elements/1.1/\"><metadata><dc:title>{title}</dc:title><dc:creator>Автор</dc:creator></metadata></package>"
    );
    fs::write(book.join("metadata.opf"), xml).expect("metadata.opf");
}

#[test]
fn indexes_calibre_books_and_sets_revision() {
    let root = prepare_book("Название");

    let catalog = sync(&TestFs::new(root)).expect("построение индекса");

    assert_eq!(catalog.books.len(), 1);
    assert_eq!(catalog.revision, 1);
    assert_eq!(catalog.books[0].title, "Название");
    assert_eq!(catalog.books[0].authors, ["Автор"]);
}

#[test]
fn reopen_skips_reads_for_unchanged_book() {
    let root = prepare_book("Название");
    let fs = TestFs::new(root);

    let first = sync(&fs).expect("первое построение");
    assert!(fs.reads() >= 1, "первое сканирование читает metadata.opf");

    fs.reset_reads();
    let second = sync(&fs).expect("повторное открытие");

    assert_eq!(fs.reads(), 0, "неизменённая книга не перечитывается");
    assert_eq!(first.books, second.books);
    assert_eq!(second.revision, 1);
}

#[test]
fn changed_metadata_is_reread() {
    let root = prepare_book("Название");
    let book = root.join("Автор").join("Папка");
    let fs = TestFs::new(root);
    sync(&fs).expect("первое построение");

    write_opf(&book, "Новое название");
    fs.reset_reads();

    let catalog = sync(&fs).expect("актуализация");

    assert!(fs.reads() >= 1, "изменённый metadata.opf перечитан");
    assert_eq!(catalog.books[0].title, "Новое название");
    assert_eq!(catalog.revision, 2, "изменение подняло ревизию");
}

#[test]
fn removed_book_is_dropped() {
    let root = prepare_book("Название");
    let fs = TestFs::new(root.clone());
    sync(&fs).expect("первое построение");

    fs::remove_dir_all(root.join("Автор")).expect("удаление книги");

    let catalog = sync(&fs).expect("актуализация");

    assert!(catalog.books.is_empty(), "удалённая книга исключена");
    assert_eq!(catalog.revision, 2, "удаление подняло ревизию");
}

#[test]
fn legacy_json_state_is_deleted() {
    let root = prepare_book("Название");
    fs::create_dir_all(root.join(".state")).expect("storage");
    fs::write(root.join(".state").join("calibre-state.json"), "broken").expect("старое состояние");

    sync(&TestFs::new(root.clone())).expect("построение индекса");

    assert!(
        !root.join(".state").join("calibre-state.json").exists(),
        "устаревшее JSON-состояние удалено"
    );
}

#[test]
fn sql_failure_is_propagated() {
    let root = prepare_book("Название");

    assert!(
        sync(&TestFs::failing(root)).is_err(),
        "недоступность SQL-хранилища диагностируется"
    );
}

#[test]
fn stores_cover_file_in_index_and_reuses_without_reread() {
    let root = prepare_book("Название");
    let book = root.join("Автор").join("Папка");
    fs::write(book.join("cover.jpg"), b"cover-bytes").expect("обложка");
    let fs = TestFs::new(root);

    sync(&fs).expect("построение индекса");
    fs.reset_reads();

    let cover = load_cover(&fs, "Автор/Папка")
        .expect("запрос обложки")
        .expect("обложка сохранена");
    assert_eq!(
        cover.0,
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, b"cover-bytes")
    );
    assert_eq!(cover.1, "jpg");
    assert_eq!(
        fs.reads(),
        0,
        "обложка получена из индекса без чтения файла"
    );
}

#[test]
fn publishes_progress_only_when_processing() {
    let root = prepare_book("Название");
    let fs = TestFs::new(root);

    sync(&fs).expect("построение индекса");
    let events = fs.events();
    assert_eq!(
        events.len(),
        2,
        "начальное событие и событие на обработанную книгу"
    );
    assert_eq!(events[0].0, "library-index-progress");
    let first: serde_json::Value = serde_json::from_str(&events[0].1).expect("payload");
    assert_eq!(first["done"], 0, "объём известен до чтения файлов");
    assert_eq!(first["total"], 1);
    let payload: serde_json::Value = serde_json::from_str(&events[1].1).expect("payload");
    assert_eq!(payload["done"], 1);
    assert_eq!(payload["total"], 1);
    assert_eq!(payload["percent"], 100);

    let before = fs.events().len();
    sync(&fs).expect("повторное открытие");
    assert_eq!(
        fs.events().len(),
        before,
        "при актуальном индексе прогресс не публикуется"
    );
}
