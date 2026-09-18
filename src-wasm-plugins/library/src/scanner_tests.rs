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
use crate::lifecycle;
use crate::models::{ExternalBook, ExternalFileKind};

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

/// Тестовая файловая система с отказом записи состояния.
struct FailingStateFs {
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

    fn read_bytes(&self, path: &str) -> Result<Vec<u8>, String> {
        fs::read(
            self.root
                .join(path.replace('/', std::path::MAIN_SEPARATOR_STR)),
        )
        .map_err(|error| error.to_string())
    }

    fn open_file(&self, _path: &str) -> Result<(), String> {
        Ok(())
    }

    fn state_read(&self, key: &str) -> Result<Option<String>, String> {
        let path = self.root.join(".state").join(key);
        match fs::read_to_string(path) {
            Ok(value) => Ok(Some(value)),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(error.to_string()),
        }
    }

    fn state_write(&self, key: &str, value: &str) -> Result<(), String> {
        let directory = self.root.join(".state");
        fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
        fs::write(directory.join(key), value).map_err(|error| error.to_string())
    }

    fn state_delete(&self, key: &str) -> Result<(), String> {
        match fs::remove_file(self.root.join(".state").join(key)) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.to_string()),
        }
    }
}

impl Fs for FailingStateFs {
    fn list_dir(&self, path: &str) -> Result<Vec<String>, String> {
        NativeFs {
            root: self.root.clone(),
        }
        .list_dir(path)
    }

    fn read_bytes(&self, path: &str) -> Result<Vec<u8>, String> {
        NativeFs {
            root: self.root.clone(),
        }
        .read_bytes(path)
    }

    fn open_file(&self, _path: &str) -> Result<(), String> {
        Ok(())
    }

    fn state_read(&self, _key: &str) -> Result<Option<String>, String> {
        Ok(None)
    }

    fn state_write(&self, _key: &str, _value: &str) -> Result<(), String> {
        Err("storage недоступен".to_string())
    }

    fn state_delete(&self, _key: &str) -> Result<(), String> {
        Ok(())
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

    let scanned = super::scan(&fs)
        .expect("сканирование библиотеки")
        .into_iter()
        .find(|book| book.id == "Автор/Название (7)")
        .expect("книга найдена");
    assert_eq!(scanned.title, "Название (7)");
    assert_eq!(scanned.authors, ["Автор"]);
}

/// Состояние каталога восстанавливается после повторного открытия.
#[test]
fn lifecycle_restores_saved_catalog() {
    let root = test_root();
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("создание корня");
    let native = NativeFs { root: root.clone() };
    let book = ExternalBook {
        id: "Автор/Книга".to_string(),
        title: "Книга".to_string(),
        authors: vec!["Автор".to_string()],
        tags: Vec::new(),
        series: Vec::new(),
        files: Vec::new(),
    };

    let first = lifecycle::open(&native, vec![book.clone()]).expect("открытие");
    let restored = lifecycle::open(&native, vec![book.clone()]).expect("восстановление");

    assert_eq!(first.books, restored.books);
    assert_eq!(restored.books, vec![book]);
}

/// Повреждённое состояние удаляется и заменяется новым каталогом.
#[test]
fn lifecycle_rebuilds_corrupted_state() {
    let root = test_root();
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join(".state")).expect("создание storage");
    fs::write(root.join(".state/library-state.json"), "broken").expect("повреждённое состояние");
    let native = NativeFs { root };

    let catalog = lifecycle::open(&native, Vec::new()).expect("перестроение");

    assert!(catalog.books.is_empty());
    assert_eq!(catalog.revision, 1);
}

/// Ошибка storage не заменяет последний согласованный каталог.
#[test]
fn lifecycle_keeps_last_catalog_when_storage_write_fails() {
    let root = test_root();
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("создание корня");
    let native = NativeFs { root: root.clone() };
    let book = ExternalBook {
        id: "Автор/Книга".to_string(),
        title: "Книга".to_string(),
        authors: vec!["Автор".to_string()],
        tags: Vec::new(),
        series: Vec::new(),
        files: Vec::new(),
    };
    let previous = lifecycle::open(&native, vec![book.clone()]).expect("первое состояние");
    let failing = FailingStateFs { root };

    assert!(lifecycle::sync(&failing, vec![book]).is_err());
    assert_eq!(lifecycle::catalog().expect("последний каталог"), previous);
}
