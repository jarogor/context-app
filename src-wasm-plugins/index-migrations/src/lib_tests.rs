//! Тесты версионированных миграций схемы.
//!
//! SQL исполняет настоящий SQLite (`rusqlite`), чтобы проверять именно те
//! скрипты, что формируют плагины.

use super::{apply, latest_version, Migration, Outcome};

/// Миграция, создающая таблицу книг.
const V1: Migration = Migration {
    version: 1,
    sql: "CREATE TABLE books (id TEXT PRIMARY KEY, title TEXT NOT NULL);",
};

/// Миграция, добавляющая таблицу обложек.
const V2: Migration = Migration {
    version: 2,
    sql: "CREATE TABLE covers (book_id TEXT PRIMARY KEY, data TEXT NOT NULL);",
};

/// Миграция, добавляющая книге свойство (будущее расширение).
const V3: Migration = Migration {
    version: 3,
    sql: "ALTER TABLE books ADD COLUMN rating INTEGER;",
};

/// Миграция с некорректным SQL.
const BROKEN: Migration = Migration {
    version: 3,
    sql: "THIS IS NOT SQL;",
};

/// SQL-хранилище на базе настоящего SQLite в памяти.
struct Db {
    connection: rusqlite::Connection,
}

impl Db {
    /// Создание пустой базы.
    fn new() -> Self {
        Self {
            connection: rusqlite::Connection::open_in_memory().expect("открытие SQLite"),
        }
    }

    /// Исполнение SQL без параметров.
    fn execute(&self, sql: &str) -> Result<(), String> {
        self.connection
            .execute_batch(sql)
            .map_err(|error| error.to_string())
    }

    /// Чтение строк как JSON-массива объектов.
    fn query(&self, sql: &str) -> Result<String, String> {
        let mut statement = self
            .connection
            .prepare(sql)
            .map_err(|error| error.to_string())?;
        let columns: Vec<String> = statement
            .column_names()
            .iter()
            .map(|name| (*name).to_string())
            .collect();
        let mut rows = statement.query([]).map_err(|error| error.to_string())?;
        let mut result = Vec::new();
        while let Some(row) = rows.next().map_err(|error| error.to_string())? {
            let mut object = serde_json::Map::with_capacity(columns.len());
            for (index, name) in columns.iter().enumerate() {
                let value = row.get_ref(index).map_err(|error| error.to_string())?;
                object.insert(name.clone(), value_to_json(value));
            }
            result.push(serde_json::Value::Object(object));
        }
        serde_json::to_string(&result).map_err(|error| error.to_string())
    }

    /// Текущая версия схемы.
    fn version(&self) -> i64 {
        let raw = self.query("PRAGMA user_version").expect("версия схемы");
        let rows: Vec<serde_json::Value> = serde_json::from_str(&raw).expect("JSON версии");
        rows.first()
            .and_then(|row| row.get("user_version"))
            .and_then(serde_json::Value::as_i64)
            .unwrap_or(0)
    }

    /// Применение миграций к этой базе.
    fn apply(&self, migrations: &[Migration]) -> Result<Outcome, String> {
        apply(migrations, |sql| self.execute(sql), |sql| self.query(sql))
    }
}

/// Преобразование значения SQLite в JSON.
fn value_to_json(value: rusqlite::types::ValueRef<'_>) -> serde_json::Value {
    use rusqlite::types::ValueRef;
    match value {
        ValueRef::Null => serde_json::Value::Null,
        ValueRef::Integer(integer) => serde_json::Value::from(integer),
        ValueRef::Real(float) => serde_json::Number::from_f64(float)
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null),
        ValueRef::Text(bytes) => {
            serde_json::Value::String(String::from_utf8_lossy(bytes).into_owned())
        }
        ValueRef::Blob(bytes) => serde_json::Value::String(format!("blob:{}", bytes.len())),
    }
}

#[test]
fn latest_version_is_highest() {
    assert_eq!(latest_version(&[V1, V3, V2]), 3);
    assert_eq!(latest_version(&[]), 0);
}

#[test]
fn applies_all_migrations_on_fresh_schema() {
    let db = Db::new();

    let outcome = db.apply(&[V1, V2]).expect("применение миграций");

    assert_eq!(outcome, Outcome::Migrated(2));
    assert_eq!(db.version(), 2);
    db.execute("INSERT INTO books (id, title) VALUES ('a', 'A')")
        .expect("таблица книг создана");
    db.execute("INSERT INTO covers (book_id, data) VALUES ('a', 'x')")
        .expect("таблица обложек создана");
}

#[test]
fn is_idempotent_on_current_schema() {
    let db = Db::new();
    db.apply(&[V1, V2]).expect("первое применение");

    let outcome = db.apply(&[V1, V2]).expect("повторное применение");

    assert_eq!(outcome, Outcome::UpToDate);
}

#[test]
fn applies_additive_migration_keeping_data() {
    let db = Db::new();
    db.apply(&[V1]).expect("начальная схема");
    db.execute("INSERT INTO books (id, title) VALUES ('a', 'A')")
        .expect("данные до миграции");

    let outcome = db.apply(&[V1, V2, V3]).expect("дополнение схемы");

    assert_eq!(outcome, Outcome::Migrated(3));
    assert_eq!(db.version(), 3);
    let rows = db.query("SELECT id, title FROM books").expect("данные");
    assert!(rows.contains("\"A\""), "данные сохранились после миграций");
}

#[test]
fn future_version_requires_rebuild() {
    let db = Db::new();
    db.apply(&[V1]).expect("начальная схема");
    db.execute("PRAGMA user_version = 99")
        .expect("версия из будущего");

    let outcome = db.apply(&[V1, V2]).expect("проверка версии");

    assert_eq!(outcome, Outcome::Rebuild);
}

#[test]
fn failed_migration_leaves_version_unchanged() {
    let db = Db::new();
    db.apply(&[V1]).expect("начальная схема");

    let result = db.apply(&[V1, BROKEN]);

    assert!(result.is_err(), "ошибка миграции возвращается");
    assert_eq!(db.version(), 1, "версия не изменилась при ошибке");
}

#[test]
fn empty_migrations_are_up_to_date() {
    let db = Db::new();

    assert_eq!(db.apply(&[]).expect("пустой список"), Outcome::UpToDate);
}
