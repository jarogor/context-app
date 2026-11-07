//! Тесты локального SQLite-индекса generic-источника.
//!
//! Индекс в WASM-окружении работает через SQL host-функции; в нативных тестах
//! SQL исполняет `TestFs` настоящим SQLite, а число прочитанных файлов
//! показывает инкрементальность.

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

use super::{load_catalog, load_cover, sync, write_catalog};
use crate::models::{ExternalBook, ExternalFile, ExternalFileKind};
use crate::test_fs::TestFs;

/// Счётчик для уникальных имён временных папок каждого теста.
static NEXT_ROOT: AtomicU64 = AtomicU64::new(0);

/// Создание уникальной временной папки для теста.
fn test_root() -> PathBuf {
    let seed = NEXT_ROOT.fetch_add(1, Ordering::Relaxed);
    std::env::temp_dir().join(format!("library-index-{seed}"))
}

/// Создание пустого корня библиотеки.
fn prepare_root() -> PathBuf {
    let root = test_root();
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("создание корня");
    root
}

#[test]
fn indexes_new_files_and_sets_revision() {
    let root = prepare_root();
    fs::write(root.join("Первая.epub"), "epub-1").expect("книга");
    fs::write(root.join("Вторая.pdf"), "pdf-2").expect("книга");

    let catalog = sync(&TestFs::new(root.clone())).expect("построение индекса");

    assert_eq!(catalog.books.len(), 2);
    assert_eq!(catalog.revision, 1, "первая ревизия");
    let ids = catalog
        .books
        .iter()
        .map(|book| book.id.clone())
        .collect::<Vec<_>>();
    assert!(ids.contains(&"Первая.epub".to_string()));
    assert!(ids.contains(&"Вторая.pdf".to_string()));
}

#[test]
fn reopen_skips_reads_for_unchanged_files() {
    let root = prepare_root();
    fs::write(root.join("Первая.epub"), "epub-1").expect("книга");
    fs::write(root.join("Вторая.pdf"), "pdf-2").expect("книга");
    let fs = TestFs::new(root);

    let first = sync(&fs).expect("первое построение");
    assert_eq!(fs.reads(), 2, "первое сканирование читает оба файла");

    fs.reset_reads();
    let second = sync(&fs).expect("повторное открытие");

    assert_eq!(fs.reads(), 0, "неизменённые файлы не перечитываются");
    assert_eq!(first.books, second.books);
    assert_eq!(second.revision, 1, "без изменений ревизия не растёт");
}

#[test]
fn changed_file_is_reread_and_removed_file_is_dropped() {
    let root = prepare_root();
    fs::write(root.join("Первая.epub"), "epub-1").expect("книга");
    fs::write(root.join("Вторая.pdf"), "pdf-2").expect("книга");
    let fs = TestFs::new(root.clone());
    sync(&fs).expect("первое построение");

    fs::write(root.join("Первая.epub"), "epub-1-изменённая").expect("изменение");
    fs::remove_file(root.join("Вторая.pdf")).expect("удаление");
    fs.reset_reads();

    let catalog = sync(&fs).expect("актуализация");

    assert_eq!(fs.reads(), 1, "перечитан только изменённый файл");
    assert_eq!(catalog.books.len(), 1, "удалённая книга исключена");
    assert_eq!(catalog.books[0].id, "Первая.epub");
    assert_eq!(catalog.revision, 2, "изменения подняли ревизию");
}

#[test]
fn legacy_json_state_is_deleted() {
    let root = prepare_root();
    fs::create_dir_all(root.join(".state")).expect("storage");
    fs::write(root.join(".state").join("library-state.json"), "broken").expect("старое состояние");

    sync(&TestFs::new(root.clone())).expect("построение индекса");

    assert!(
        !root.join(".state").join("library-state.json").exists(),
        "устаревшее JSON-состояние удалено"
    );
}

#[test]
fn write_catalog_and_load_roundtrip() {
    let root = prepare_root();
    let fs = TestFs::new(root);
    let book = ExternalBook {
        id: "books/Книга.epub".to_string(),
        title: "Книга".to_string(),
        authors: vec!["Автор".to_string()],
        tags: vec!["тег".to_string()],
        series: vec![("Серия".to_string(), 2)],
        files: vec![ExternalFile {
            kind: ExternalFileKind::Book,
            path: "books/Книга.epub".to_string(),
            format: "epub".to_string(),
        }],
        ..ExternalBook::default()
    };

    let revision = write_catalog(&fs, std::slice::from_ref(&book)).expect("запись каталога");
    let catalog = load_catalog(&fs).expect("загрузка каталога");

    assert_eq!(revision, 1);
    assert_eq!(catalog.revision, 1);
    assert_eq!(catalog.books, vec![book]);
}

#[test]
fn sql_failure_is_propagated() {
    let root = prepare_root();
    let fs = TestFs::failing(root);

    assert!(
        sync(&fs).is_err(),
        "недоступность SQL-хранилища диагностируется"
    );
}

/// Запись FB2 с встроенной обложкой.
fn write_fb2_with_cover(path: &std::path::Path, title: &str, cover: &[u8]) {
    use base64::Engine;
    let binary = base64::engine::general_purpose::STANDARD.encode(cover);
    let xml = format!(
        r##"<?xml version="1.0"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
 <description><title-info>
  <book-title>{title}</book-title>
  <coverpage><image l:href="#cover.png"/></coverpage>
 </title-info></description>
 <binary id="cover.png" content-type="image/png">{binary}</binary>
</FictionBook>"##
    );
    fs::write(path, xml).expect("fb2 с обложкой");
}

#[test]
fn stores_cover_in_index_and_reuses_without_reread() {
    let root = prepare_root();
    write_fb2_with_cover(&root.join("Книга.fb2"), "Книга", b"cover-bytes");
    let fs = TestFs::new(root);

    sync(&fs).expect("построение индекса");
    fs.reset_reads();

    let cover = load_cover(&fs, "Книга.fb2")
        .expect("запрос обложки")
        .expect("обложка сохранена в индексе");
    assert_eq!(
        cover.0,
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, b"cover-bytes")
    );
    assert_eq!(cover.1, "png");
    assert_eq!(
        fs.reads(),
        0,
        "обложка получена из индекса без чтения файла"
    );
}

#[test]
fn updates_cover_when_file_changes() {
    let root = prepare_root();
    let path = root.join("Книга.fb2");
    write_fb2_with_cover(&path, "Книга", b"old");
    let fs = TestFs::new(root);
    sync(&fs).expect("первое построение");

    write_fb2_with_cover(&path, "Книга", b"new-cover");
    fs.reset_reads();
    sync(&fs).expect("переиндексация");

    let cover = load_cover(&fs, "Книга.fb2")
        .expect("запрос обложки")
        .expect("обложка");
    assert_eq!(
        cover.0,
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, b"new-cover"),
        "обложка обновилась вместе с книгой"
    );
}

#[test]
fn publishes_progress_only_when_processing() {
    let root = prepare_root();
    write_fb2_with_cover(&root.join("Первая.fb2"), "Первая", b"a");
    write_fb2_with_cover(&root.join("Вторая.fb2"), "Вторая", b"b");
    let fs = TestFs::new(root);

    sync(&fs).expect("построение индекса");
    let events = fs.events();
    assert_eq!(
        events.len(),
        3,
        "начальное событие и событие на каждую обработанную книгу"
    );
    assert_eq!(events[0].0, "library-index-progress");
    let first: serde_json::Value = serde_json::from_str(&events[0].1).expect("payload");
    assert_eq!(first["done"], 0, "объём известен до чтения файлов");
    assert_eq!(first["total"], 2);
    let last: serde_json::Value = serde_json::from_str(&events[2].1).expect("payload");
    assert_eq!(last["done"], 2);
    assert_eq!(last["total"], 2);
    assert_eq!(last["percent"], 100);

    let before = fs.events().len();
    sync(&fs).expect("повторное открытие");
    assert_eq!(
        fs.events().len(),
        before,
        "при актуальном индексе прогресс не публикуется"
    );
}
