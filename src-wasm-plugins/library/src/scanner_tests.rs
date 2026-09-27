//! Тесты сканирования директории книг generic-источника.
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
use crate::models::{DirEntry, EntryKind, ExternalBook};

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
    fn list_dir(&self, path: &str) -> Result<Vec<DirEntry>, String> {
        let dir = self
            .root
            .join(path.replace('/', std::path::MAIN_SEPARATOR_STR));
        let mut entries = Vec::new();
        if let Ok(reader) = fs::read_dir(&dir) {
            for entry in reader.flatten() {
                let kind = match entry.file_type() {
                    Ok(file_type) if file_type.is_dir() => EntryKind::Dir,
                    Ok(file_type) if file_type.is_file() => EntryKind::File,
                    _ => EntryKind::Symlink,
                };
                entries.push(DirEntry {
                    name: entry.file_name().to_string_lossy().into_owned(),
                    kind,
                });
            }
        }
        entries.sort_by(|left, right| left.name.cmp(&right.name));
        Ok(entries)
    }

    fn read_bytes(&self, path: &str) -> Result<Vec<u8>, String> {
        fs::read(
            self.root
                .join(path.replace('/', std::path::MAIN_SEPARATOR_STR)),
        )
        .map_err(|error| error.to_string())
    }

    fn import_read_bytes(&self, path: &str) -> Result<Vec<u8>, String> {
        fs::read(path).map_err(|error| error.to_string())
    }

    fn write_bytes(&self, path: &str, bytes: &[u8]) -> Result<(), String> {
        let target = self.root.join(path);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        fs::write(target, bytes).map_err(|error| error.to_string())
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
    fn list_dir(&self, path: &str) -> Result<Vec<DirEntry>, String> {
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

    fn import_read_bytes(&self, path: &str) -> Result<Vec<u8>, String> {
        NativeFs {
            root: self.root.clone(),
        }
        .import_read_bytes(path)
    }

    fn write_bytes(&self, path: &str, bytes: &[u8]) -> Result<(), String> {
        NativeFs {
            root: self.root.clone(),
        }
        .write_bytes(path, bytes)
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

/// Каждый файл книги становится отдельной книгой, включая вложенные папки.
#[test]
fn scans_nested_books_as_separate_files() {
    let root = test_root();
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join("a").join("b")).expect("создание папок");
    fs::write(root.join("a").join("b").join("Первый.epub"), "epub").expect("книга");
    fs::write(root.join("Второй.pdf"), "pdf").expect("книга");
    fs::write(root.join("notes.md"), "заметки").expect("шум");
    let fs = NativeFs { root };

    let books = scan(&fs).expect("сканирование");

    assert_eq!(books.len(), 2, "найдены обе книги");
    let titles = books.iter().map(|book| book.title.clone()).collect::<Vec<_>>();
    assert!(titles.contains(&"Первый".to_string()));
    assert!(titles.contains(&"Второй".to_string()));
}

/// Название берётся из имени файла, автора и обложки нет.
#[test]
fn book_has_no_author_and_no_cover() {
    let root = test_root();
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("создание корня");
    fs::write(root.join("Название книги.fb2"), "fb2").expect("книга");
    fs::write(root.join("cover.jpg"), "cover").expect("обложка");
    let fs = NativeFs { root };

    let books = scan(&fs).expect("сканирование");

    assert_eq!(books.len(), 1);
    assert_eq!(books[0].title, "Название книги");
    assert!(books[0].authors.is_empty());
    assert_eq!(books[0].files.len(), 1);
    assert_eq!(books[0].files[0].format, "fb2");
}

/// Скрытые папки и элементы пропускаются.
#[test]
fn skips_hidden_entries() {
    let root = test_root();
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join(".hidden")).expect("скрытая папка");
    fs::write(root.join(".hidden").join("Скрытая.epub"), "epub").expect("книга");
    fs::write(root.join(".secret.epub"), "epub").expect("скрытый файл");
    let fs = NativeFs { root };

    let books = scan(&fs).expect("сканирование");

    assert!(books.is_empty());
}

/// Probe находит книгу во вложенной папке.
#[test]
fn probe_detects_book_in_nested_folder() {
    let root = test_root();
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join("level").join("deep")).expect("папки");
    fs::write(root.join("level").join("deep").join("book.epub"), "epub").expect("книга");
    let fs = NativeFs { root };

    assert_eq!(super::probe(&fs).expect("проверка"), Some(super::PROBE_PRIORITY));
}

/// Generic-источник подтверждает любую директорию, включая пустую.
#[test]
fn probe_confirms_any_directory() {
    let root = test_root();
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join("Папка")).expect("папка");
    fs::write(root.join("readme.log"), "текст").expect("файл");
    fs::write(root.join("Папка").join("notes.md"), "заметки").expect("файл");
    let fs = NativeFs { root };

    assert_eq!(
        super::probe(&fs).expect("проверка"),
        Some(super::PROBE_PRIORITY),
        "generic-источник — базовый и подтверждает любую директорию"
    );
}

/// Состояние каталога восстанавливается после повторного открытия.
#[test]
fn lifecycle_restores_saved_catalog() {
    let root = test_root();
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("создание корня");
    let native = NativeFs { root: root.clone() };
    let book = ExternalBook {
        id: "Книга.epub".to_string(),
        title: "Книга".to_string(),
        authors: Vec::new(),
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
        id: "Книга.epub".to_string(),
        title: "Книга".to_string(),
        authors: Vec::new(),
        tags: Vec::new(),
        series: Vec::new(),
        files: Vec::new(),
    };
    let previous = lifecycle::open(&native, vec![book.clone()]).expect("первое состояние");
    let failing = FailingStateFs { root };

    assert!(lifecycle::sync(&failing, vec![book]).is_err());
    assert_eq!(lifecycle::catalog().expect("последний каталог"), previous);
}
