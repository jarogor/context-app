//! Тесты общей схемы каталога, миграций и хелперов индекса.
//!
//! SQL исполняет настоящее SQLite (`sqlite-test-harness`), поэтому проверяются
//! именно те выражения, которые формирует каркас.

use std::cell::Cell;
use std::path::PathBuf;

use std::sync::atomic::{AtomicU64, Ordering};

use source_protocol::fs::Fs;
use source_protocol::models::DirEntry;

use super::{
    ensure_schema, load_book, load_books, load_covers, store_cover, upsert_book, BookRecord,
    CATALOG_MIGRATIONS,
};

/// Счётчик уникальных хранилищ каждого теста.
static NEXT_ROOT: AtomicU64 = AtomicU64::new(0);

/// Тестовое окружение каркаса: настоящее SQLite и подставное время.
struct TestDb {
    /// Ключ хранилища в тестовом SQL-движке.
    root: PathBuf,
    /// Текущее время, которое «видит» плагин.
    now: Cell<i64>,
}

impl TestDb {
    /// Создание отдельного пустого хранилища.
    fn new() -> Self {
        let seed = NEXT_ROOT.fetch_add(1, Ordering::Relaxed);
        Self {
            root: std::env::temp_dir().join(format!("source-index-{seed}")),
            now: Cell::new(1_000),
        }
    }

    /// Исполнение SQL без параметров.
    fn execute(&self, sql: &str) -> Result<(), String> {
        sqlite_test_harness::test_sql::execute(&self.root, sql, "[]")
    }

    /// Чтение строк запроса.
    fn query(&self, sql: &str) -> Result<Vec<serde_json::Value>, String> {
        let raw = sqlite_test_harness::test_sql::query(&self.root, sql, "[]")?;
        serde_json::from_str(&raw).map_err(|error| error.to_string())
    }
}

impl Fs for TestDb {
    fn list_dir(&self, _path: &str) -> Result<Vec<DirEntry>, String> {
        Ok(Vec::new())
    }

    fn read_bytes(&self, _path: &str) -> Result<Vec<u8>, String> {
        Err("файлов нет".to_string())
    }

    fn open_file(&self, _path: &str) -> Result<(), String> {
        Ok(())
    }

    fn state_delete(&self, _key: &str) -> Result<(), String> {
        Ok(())
    }

    fn sql_execute(&self, sql: &str, params: &str) -> Result<(), String> {
        sqlite_test_harness::test_sql::execute(&self.root, sql, params)
    }

    fn sql_query(&self, sql: &str, params: &str) -> Result<String, String> {
        sqlite_test_harness::test_sql::query(&self.root, sql, params)
    }

    fn emit_event(&self, _name: &str, _payload: &str) -> Result<(), String> {
        Ok(())
    }

    fn now_millis(&self) -> Option<i64> {
        Some(self.now.get())
    }
}

/// Запись книги со всеми полями общей схемы.
fn record(id: &str, added_at_ms: Option<i64>) -> BookRecord {
    BookRecord {
        id: id.to_string(),
        title: format!("Книга {id}"),
        authors: r#"["Автор"]"#.to_string(),
        tags: r#"["тег"]"#.to_string(),
        series: r#"[["Серия",1]]"#.to_string(),
        files: format!(r#"[{{"kind":"book","path":"{id}.epub","format":"epub"}}]"#),
        format: "epub".to_string(),
        size: Some(1024),
        mtime_ms: Some(5),
        added_at_ms,
        language: Some("ru".to_string()),
        published: Some("2019-05-01".to_string()),
        publisher: Some("Издатель".to_string()),
        description: Some("Описание".to_string()),
        identifier: Some("978-1".to_string()),
        signature: None,
    }
}

#[test]
fn fresh_schema_has_all_catalog_tables() {
    let db = TestDb::new();

    ensure_schema(&db, CATALOG_MIGRATIONS, "library-state.json").expect("схема");

    // Схема сразу версия 1: цепочек версий приложение пока не ведёт.
    let version = db.query("PRAGMA user_version").expect("версия схемы");
    assert_eq!(version[0]["user_version"], 1, "схема каталога — версия 1");

    let columns = db
        .query("PRAGMA table_info(books)")
        .expect("столбцы таблицы книг");
    let names: Vec<String> = columns
        .iter()
        .map(|column| column["name"].as_str().unwrap_or_default().to_string())
        .collect();
    for expected in [
        "id",
        "title",
        "authors",
        "tags",
        "series",
        "files",
        "format",
        "size",
        "mtime_ms",
        "added_at_ms",
        "language",
        "published",
        "publisher",
        "description",
        "identifier",
        "signature",
    ] {
        assert!(
            names.contains(&expected.to_string()),
            "нет столбца {expected}"
        );
    }

    let tables = db
        .query("SELECT name FROM sqlite_master WHERE type = 'table'")
        .expect("таблицы");
    let table_names: Vec<&str> = tables
        .iter()
        .filter_map(|row| row["name"].as_str())
        .collect();
    assert!(table_names.contains(&"meta"), "таблица meta");
    assert!(table_names.contains(&"covers"), "таблица обложек");
}

#[test]
fn schema_from_newer_build_forces_rebuild() {
    let db = TestDb::new();
    db.execute("PRAGMA user_version = 99;").expect("версия");

    ensure_schema(&db, CATALOG_MIGRATIONS, "library-state.json").expect("пересборка");

    let version = db.query("PRAGMA user_version").expect("версия схемы");
    assert_eq!(
        version[0]["user_version"], 1,
        "схема пересобрана в текущую версию"
    );
    upsert_book(&db, &record("a", Some(1))).expect("запись после пересборки");
    assert_eq!(load_books(&db).expect("загрузка").len(), 1);
}

#[test]
fn book_properties_roundtrip() {
    let db = TestDb::new();
    ensure_schema(&db, CATALOG_MIGRATIONS, "library-state.json").expect("схема");
    let mut book = record("a", Some(100));
    book.signature = Some("1:2:3".to_string());

    upsert_book(&db, &book).expect("запись");

    let loaded = load_book(&db, "a").expect("загрузка").expect("книга");
    assert_eq!(loaded.title, book.title);
    assert_eq!(loaded.language.as_deref(), Some("ru"));
    assert_eq!(loaded.published.as_deref(), Some("2019-05-01"));
    assert_eq!(loaded.publisher.as_deref(), Some("Издатель"));
    assert_eq!(loaded.description.as_deref(), Some("Описание"));
    assert_eq!(loaded.identifier.as_deref(), Some("978-1"));
    assert_eq!(loaded.size, Some(1024));
    assert_eq!(loaded.added_at_ms, Some(100));
    assert_eq!(loaded.signature.as_deref(), Some("1:2:3"));
    assert_eq!(
        load_book(&db, "b").expect("загрузка"),
        None,
        "неизвестная книга не находится"
    );
}

#[test]
fn added_at_is_kept_when_book_is_updated() {
    let db = TestDb::new();
    ensure_schema(&db, CATALOG_MIGRATIONS, "library-state.json").expect("схема");
    upsert_book(&db, &record("a", Some(100))).expect("первая запись");

    // Файл изменился: время добавления не перезаписывается.
    let mut changed = record("a", Some(900));
    changed.title = "Новое название".to_string();
    upsert_book(&db, &changed).expect("обновление");

    let loaded = load_book(&db, "a").expect("загрузка").expect("книга");
    assert_eq!(loaded.title, "Новое название");
    assert_eq!(
        loaded.added_at_ms,
        Some(100),
        "правка файла не переносит книгу в начало списка"
    );
}

#[test]
fn batch_covers_are_loaded_by_ids() {
    let db = TestDb::new();
    ensure_schema(&db, CATALOG_MIGRATIONS, "library-state.json").expect("схема");
    upsert_book(&db, &record("a", Some(1))).expect("книга a");
    upsert_book(&db, &record("b", Some(2))).expect("книга b");
    store_cover(&db, "a", Some(&(vec![1, 2, 3], "png".to_string())), None).expect("обложка");

    let covers = load_covers(&db, &["a".to_string(), "b".to_string(), "c".to_string()])
        .expect("пакет обложек");

    // Обложка есть только у одной книги; неизвестный идентификатор не мешает.
    assert_eq!(covers.len(), 1);
    assert_eq!(covers["a"].format, "png");
}
