//! Тесты сканирования каталога книг базового плагина.
//!
//! Сканер в WASM-окружении работает через host-функции, поэтому в нативных
//! тестах вместо них используется локальное чтение временной папки через ту же
//! абстракцию `Fs`.

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

use super::scan;
use crate::fs::Fs;
use crate::models::ExternalFileKind;

/// Счётчик для уникальных имён временных папок каждого теста.
static NEXT_ROOT: AtomicU64 = AtomicU64::new(0);

/// Создание уникальной временной папки для теста.
fn test_root() -> PathBuf {
    let seed = NEXT_ROOT.fetch_add(1, Ordering::Relaxed);
    std::env::temp_dir().join(format!("library-test-{seed}"))
}

/// Локальное чтение временной папки с той же семантикой, что host-функции.
struct NativeFs {
    root: PathBuf,
}

impl Fs for NativeFs {
    fn list_dir(&self, path: &str) -> Result<Vec<String>, String> {
        let dir = self
            .root
            .join(path.replace('/', std::path::MAIN_SEPARATOR_STR));
        let mut names = Vec::new();
        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                names.push(entry.file_name().to_string_lossy().into_owned());
            }
        }
        names.sort();
        Ok(names)
    }
}

/// Сканирование находит книгу и игнорирует корневой шум.
#[test]
fn scans_books_and_ignores_root_noise() {
    let root = test_root();
    let _ = fs::remove_dir_all(&root);
    let book = root.join("Автор").join("Название (42)");
    fs::create_dir_all(&book).expect("создание папки книги");
    fs::write(book.join("book.epub"), "epub").expect("запись книги");
    fs::write(book.join("cover.jpg"), "cover").expect("запись обложки");
    fs::write(root.join("readme.txt"), "noise").expect("запись шума");
    fs::create_dir_all(root.join(".hidden")).expect("создание скрытой папки");
    let fs = NativeFs { root };

    let books = scan(&fs).expect("сканирование");

    assert_eq!(books.len(), 1);
    assert_eq!(books[0].title, "Название (42)");
    assert_eq!(books[0].authors, ["Автор"]);
    assert_eq!(books[0].files.len(), 2);
}

/// Файл обложки с именем `cover.*` распознаётся в составе книги.
#[test]
fn uses_cover_file_with_default_name() {
    let root = test_root();
    let _ = fs::remove_dir_all(&root);
    let book = root.join("Автор").join("Книга");
    fs::create_dir_all(&book).expect("создание папки книги");
    fs::write(book.join("book.epub"), "epub").expect("запись книги");
    fs::write(book.join("cover.png"), "cover").expect("запись обложки");
    let fs = NativeFs { root };

    let books = scan(&fs).expect("сканирование");

    assert_eq!(books.len(), 1);
    assert_eq!(books[0].files.len(), 2);
    assert!(books[0]
        .files
        .iter()
        .any(|file| matches!(file.kind, ExternalFileKind::Cover)));
}

/// Папка без файла книги не становится книгой.
#[test]
fn folder_without_book_files_is_skipped() {
    let root = test_root();
    let _ = fs::remove_dir_all(&root);
    let folder = root.join("Автор").join("Без книги");
    fs::create_dir_all(&folder).expect("создание папки");
    fs::write(folder.join("notes.md"), "заметки").expect("запись файла");
    let fs = NativeFs { root };

    let books = scan(&fs).expect("сканирование");

    assert!(books.is_empty());
}

/// Сканирование находит несколько авторов и книг.
#[test]
fn scans_multiple_authors_and_books() {
    let root = test_root();
    let _ = fs::remove_dir_all(&root);
    for (author, title) in [
        ("Автор 1", "Книга 1"),
        ("Автор 1", "Книга 2"),
        ("Автор 2", "Книга 3"),
    ] {
        let book = root.join(author).join(format!("{title} (1)"));
        fs::create_dir_all(&book).expect("создание папки книги");
        fs::write(book.join("book.epub"), "epub").expect("запись книги");
    }
    let fs = NativeFs { root };

    let books = scan(&fs).expect("сканирование");

    assert_eq!(books.len(), 3);
}

/// Структура «автор/книга» с файлом книги распознаётся как библиотека.
#[test]
fn probe_detects_library_by_author_book_structure() {
    let root = test_root();
    let _ = fs::remove_dir_all(&root);
    let book = root.join("Автор").join("Книга (1)");
    fs::create_dir_all(&book).expect("создание папки книги");
    fs::write(book.join("book.epub"), "epub").expect("запись книги");
    let fs = NativeFs { root };

    assert!(super::probe(&fs).expect("проверка структуры"));
}

/// Структура без файлов книг не считается библиотекой.
#[test]
fn probe_rejects_unrelated_structure() {
    let root = test_root();
    let _ = fs::remove_dir_all(&root);
    let folder = root.join("Папка").join("Вложенная");
    fs::create_dir_all(&folder).expect("создание папки");
    fs::write(folder.join("notes.md"), "заметки").expect("запись файла");
    fs::write(root.join("books.txt"), "список").expect("запись файла");
    let fs = NativeFs { root };

    assert!(!super::probe(&fs).expect("проверка структуры"));
}

/// Сканирование конкретной книги по относительному пути извлекает автора.
#[test]
fn scan_book_path_extracts_author_from_relative_path() {
    let root = test_root();
    let _ = fs::remove_dir_all(&root);
    let book = root.join("Автор").join("Название (7)");
    fs::create_dir_all(&book).expect("создание папки книги");
    fs::write(book.join("book.epub"), "epub").expect("запись книги");
    let fs = NativeFs { root };

    let scanned = super::scan_book_path(&fs, "Автор/Название (7)").expect("сканирование книги");

    let scanned = scanned.expect("книга найдена");
    assert_eq!(scanned.title, "Название (7)");
    assert_eq!(scanned.authors, ["Автор"]);
}
