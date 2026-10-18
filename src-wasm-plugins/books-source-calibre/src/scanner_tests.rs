//! Тесты сканирования библиотеки Calibre.
//!
//! Сканер в WASM-окружении работает через host-функции, поэтому в нативных
//! тестах используется `TestFs` — локальное чтение временной папки через ту же
//! абстракцию `Fs`.

use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

use super::{build_book, list_books, probe, sibling_cover, PROBE_PRIORITY};
use crate::models::ExternalFileKind;
use crate::test_fs::TestFs;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

/// Счётчик для уникальных имён временных папок каждого теста.
static NEXT_ROOT: AtomicU64 = AtomicU64::new(0);

/// Создание уникальной временной папки для теста.
fn test_root() -> PathBuf {
    let seed = NEXT_ROOT.fetch_add(1, Ordering::Relaxed);
    std::env::temp_dir().join(format!("calibre-test-{seed}"))
}

/// Сборка минимального EPUB с метаданными.
fn build_epub(title: &str, author: &str) -> Vec<u8> {
    let mut writer = ZipWriter::new(std::io::Cursor::new(Vec::new()));
    let options = SimpleFileOptions::default();
    writer
        .start_file("META-INF/container.xml", options)
        .expect("container");
    writer
        .write_all(
            br#"<?xml version="1.0"?><container><rootfiles><rootfile full-path="content.opf"/></rootfiles></container>"#,
        )
        .expect("container data");
    writer.start_file("content.opf", options).expect("opf");
    writer
        .write_all(
            format!(
                "<?xml version=\"1.0\"?><package><metadata><dc:title>{title}</dc:title><dc:creator>{author}</dc:creator></metadata></package>"
            )
            .as_bytes(),
        )
        .expect("opf data");
    writer.finish().expect("finish").into_inner()
}

/// Раскладка «автор/книга» распознаётся, название и автор берутся из папок.
#[test]
fn scans_author_book_structure() {
    let root = test_root();
    let _ = fs::remove_dir_all(&root);
    let book = root.join("Автор").join("Название (42)");
    fs::create_dir_all(&book).expect("создание папки книги");
    fs::write(book.join("book.pdf"), "pdf").expect("запись книги");
    fs::write(book.join("cover.jpg"), "cover").expect("запись обложки");
    let fs = TestFs::new(root);

    let listings = list_books(&fs).expect("обход");
    assert_eq!(listings.len(), 1);
    let entry = build_book(&fs, &listings[0]);

    assert_eq!(entry.title, "Название (42)");
    assert_eq!(entry.authors, ["Автор"]);
    assert_eq!(entry.files.len(), 2);
    assert!(entry
        .files
        .iter()
        .any(|file| matches!(file.kind, ExternalFileKind::Cover)));
}

/// Метаданные книги уточняются из EPUB.
#[test]
fn enriches_metadata_from_epub() {
    let root = test_root();
    let _ = fs::remove_dir_all(&root);
    let book = root.join("Автор").join("Папка");
    fs::create_dir_all(&book).expect("создание папки книги");
    fs::write(
        book.join("book.epub"),
        build_epub("Реальное название", "Реальный автор"),
    )
    .expect("запись epub");
    let fs = TestFs::new(root);

    let listings = list_books(&fs).expect("обход");
    let entry = build_book(&fs, &listings[0]);

    assert_eq!(entry.title, "Реальное название");
    assert_eq!(entry.authors, ["Реальный автор"]);
}

/// Структура «автор/книга» с `metadata.db` распознаётся, без него — нет.
#[test]
fn probe_detects_only_calibre_structure() {
    let root = test_root();
    let _ = fs::remove_dir_all(&root);
    let book = root.join("Автор").join("Книга");
    fs::create_dir_all(&book).expect("папка книги");
    fs::write(book.join("book.epub"), "epub").expect("книга");
    fs::write(root.join("metadata.db"), "db").expect("metadata.db");

    assert_eq!(
        probe(&TestFs::new(root)).expect("проверка"),
        Some(PROBE_PRIORITY)
    );

    // Похожая вложенность без metadata.db не должна перехватываться Calibre.
    let fake = test_root();
    let _ = fs::remove_dir_all(&fake);
    let nested = fake.join("author").join("book");
    fs::create_dir_all(&nested).expect("вложенные папки");
    fs::write(nested.join("note.pdf"), "pdf").expect("файл");
    assert_eq!(probe(&TestFs::new(fake)).expect("проверка"), None);

    let flat = test_root();
    let _ = fs::remove_dir_all(&flat);
    fs::create_dir_all(&flat).expect("плоский корень");
    fs::write(flat.join("book.epub"), "epub").expect("файл книги");
    assert_eq!(probe(&TestFs::new(flat)).expect("проверка"), None);
}

/// Обложка берётся из соседнего файла `cover.*` в папке книги.
#[test]
fn sibling_cover_reads_cover_next_to_book() {
    let root = test_root();
    let _ = fs::remove_dir_all(&root);
    let book = root.join("Автор").join("Книга");
    fs::create_dir_all(&book).expect("папка книги");
    fs::write(book.join("book.pdf"), "pdf").expect("книга");
    fs::write(book.join("cover.jpg"), "cover-bytes").expect("обложка");
    let fs = TestFs::new(root);

    let cover = sibling_cover(&fs, "Автор/Книга/book.pdf")
        .expect("поиск обложки")
        .expect("обложка найдена");
    assert_eq!(cover.0, b"cover-bytes");
    assert_eq!(cover.1, "jpg");
}

/// Без файла `cover.*` обложки нет: сам файл книги не подменяет её.
#[test]
fn sibling_cover_is_none_without_cover_file() {
    let root = test_root();
    let _ = fs::remove_dir_all(&root);
    let book = root.join("Автор").join("Книга");
    fs::create_dir_all(&book).expect("папка книги");
    fs::write(book.join("book.pdf"), "pdf").expect("книга");
    let fs = TestFs::new(root);

    assert!(sibling_cover(&fs, "Автор/Книга/book.pdf")
        .expect("поиск обложки")
        .is_none());
}

/// Файлы разных форматов одной книги остаются одной книгой со всеми форматами.
#[test]
fn groups_multiple_formats_of_one_book() {
    let root = test_root();
    let _ = fs::remove_dir_all(&root);
    let book = root.join("Автор").join("Книга");
    fs::create_dir_all(&book).expect("папка книги");
    fs::write(book.join("book.epub"), "epub").expect("epub");
    fs::write(book.join("book.pdf"), "pdf").expect("pdf");
    fs::write(book.join("book.fb2"), "fb2").expect("fb2");
    fs::write(book.join("cover.jpg"), "cover").expect("обложка");
    let fs = TestFs::new(root);

    let listings = list_books(&fs).expect("обход");
    // Раскладка «автор/книга» даёт одну книгу, а не по книге на формат.
    assert_eq!(listings.len(), 1);
    let entry = build_book(&fs, &listings[0]);

    let mut formats: Vec<_> = entry
        .files
        .iter()
        .filter(|file| matches!(file.kind, ExternalFileKind::Book))
        .map(|file| file.format.clone())
        .collect();
    formats.sort();
    assert_eq!(formats, ["epub", "fb2", "pdf"]);
}
