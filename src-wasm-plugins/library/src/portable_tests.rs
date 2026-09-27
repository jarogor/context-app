//! Тесты импорта книги в портируемую библиотеку.

use std::cell::RefCell;
use std::collections::HashMap;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

use super::import_book;
use crate::fs::Fs;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

/// Счётчик уникальных SQL-хранилищ тестов.
static NEXT_SQL_ROOT: AtomicU64 = AtomicU64::new(0);

/// Подставная файловая система для тестов импорта.
struct FakeFs {
    /// Байты EPUB, возвращаемые при чтении файла импорта.
    epub: Vec<u8>,
    /// Записанные файлы portable-хранилища.
    files: RefCell<HashMap<String, Vec<u8>>>,
    /// Служебное состояние плагина.
    state: RefCell<HashMap<String, String>>,
    /// Ключ SQL-хранилища теста.
    sql_root: PathBuf,
}

impl FakeFs {
    /// Создание подставной ФС с заданным EPUB.
    fn new(epub: Vec<u8>) -> Self {
        let seed = NEXT_SQL_ROOT.fetch_add(1, Ordering::Relaxed);
        Self {
            epub,
            files: RefCell::new(HashMap::new()),
            state: RefCell::new(HashMap::new()),
            sql_root: PathBuf::from(format!("portable-test-{seed}")),
        }
    }
}

impl Fs for FakeFs {
    fn list_dir(&self, _path: &str) -> Result<Vec<crate::models::DirEntry>, String> {
        Ok(Vec::new())
    }

    fn read_bytes(&self, _path: &str) -> Result<Vec<u8>, String> {
        Ok(self.epub.clone())
    }

    fn import_read_bytes(&self, _path: &str) -> Result<Vec<u8>, String> {
        Ok(self.epub.clone())
    }

    fn write_bytes(&self, path: &str, bytes: &[u8]) -> Result<(), String> {
        self.files
            .borrow_mut()
            .insert(path.to_string(), bytes.to_vec());
        Ok(())
    }

    fn open_file(&self, _path: &str) -> Result<(), String> {
        Ok(())
    }

    fn state_read(&self, key: &str) -> Result<Option<String>, String> {
        Ok(self.state.borrow().get(key).cloned())
    }

    fn state_write(&self, key: &str, value: &str) -> Result<(), String> {
        self.state
            .borrow_mut()
            .insert(key.to_string(), value.to_string());
        Ok(())
    }

    fn state_delete(&self, key: &str) -> Result<(), String> {
        self.state.borrow_mut().remove(key);
        Ok(())
    }

    fn sql_execute(&self, sql: &str, params: &str) -> Result<(), String> {
        crate::test_sql::execute(&self.sql_root, sql, params)
    }

    fn sql_query(&self, sql: &str, params: &str) -> Result<String, String> {
        crate::test_sql::query(&self.sql_root, sql, params)
    }

    fn emit_event(&self, _name: &str, _payload: &str) -> Result<(), String> {
        Ok(())
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
            br#"<?xml version="1.0"?><container><rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>"#,
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

/// Импорт EPUB добавляет книгу в портируемый каталог.
#[test]
fn imports_epub_into_portable_catalog() {
    let fs = FakeFs::new(build_epub("Моя книга", "Автор"));

    let book = import_book(&fs, "/tmp/book.epub").expect("импорт книги");

    assert_eq!(book.title, "Моя книга");
    assert_eq!(book.authors, ["Автор"]);
    assert_eq!(book.files.len(), 1);
    assert!(
        fs.files.borrow().contains_key(&book.files[0].path),
        "файл книги записан в portable storage"
    );
}
