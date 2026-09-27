//! Тесты сканирования библиотеки Calibre.

use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

use super::scan;
use crate::fs::Fs;
use crate::lifecycle;
use crate::models::{DirEntry, EntryKind, ExternalBook, ExternalFileKind};
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

/// Счётчик для уникальных имён временных папок каждого теста.
static NEXT_ROOT: AtomicU64 = AtomicU64::new(0);

/// Создание уникальной временной папки для теста.
fn test_root() -> PathBuf {
    let seed = NEXT_ROOT.fetch_add(1, Ordering::Relaxed);
    std::env::temp_dir().join(format!("calibre-test-{seed}"))
}

/// Локальное чтение временной папки с той же семантикой, что host-функции.
struct NativeFs {
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
    let fs = NativeFs { root };

    let books = scan(&fs).expect("сканирование");

    assert_eq!(books.len(), 1);
    assert_eq!(books[0].title, "Название (42)");
    assert_eq!(books[0].authors, ["Автор"]);
    assert_eq!(books[0].files.len(), 2);
    assert!(books[0]
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
    fs::write(book.join("book.epub"), build_epub("Реальное название", "Реальный автор"))
        .expect("запись epub");
    let fs = NativeFs { root };

    let books = scan(&fs).expect("сканирование");

    assert_eq!(books[0].title, "Реальное название");
    assert_eq!(books[0].authors, ["Реальный автор"]);
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
    let calibre = NativeFs { root: root.clone() };

    assert_eq!(super::probe(&calibre).expect("проверка"), Some(super::PROBE_PRIORITY));

    // Похожая вложенность без metadata.db не должна перехватываться Calibre.
    let fake = test_root();
    let _ = fs::remove_dir_all(&fake);
    let nested = fake.join("author").join("book");
    fs::create_dir_all(&nested).expect("вложенные папки");
    fs::write(nested.join("note.pdf"), "pdf").expect("файл");
    let generic = NativeFs { root: fake };

    assert_eq!(super::probe(&generic).expect("проверка"), None);

    let flat = test_root();
    let _ = fs::remove_dir_all(&flat);
    fs::create_dir_all(&flat).expect("плоский корень");
    fs::write(flat.join("book.epub"), "epub").expect("файл книги");
    let plain = NativeFs { root: flat };

    assert_eq!(super::probe(&plain).expect("проверка"), None);
}

/// Состояние каталога восстанавливается после повторного открытия.
#[test]
fn lifecycle_restores_saved_catalog() {
    let root = test_root();
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("создание корня");
    let native = NativeFs { root };
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
}


