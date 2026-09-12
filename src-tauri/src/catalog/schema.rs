//! Схема базы данных каталога и механизм миграций.
//!
//! Миграции выполняются последовательно, каждая — в своей транзакции.
//! Текущая версия схемы хранится в таблице `schema_version`.

use rusqlite::{Connection, Transaction};

/// Текущая версия схемы базы данных каталога.
pub const SCHEMA_VERSION: i64 = 1;

/// Применение всех миграций к соединению.
///
/// Повторный вызов безопасен: миграции, уже применённые версии, пропускаются.
pub fn migrate(connection: &mut Connection) -> rusqlite::Result<()> {
    ensure_schema_version_table(connection)?;
    let current = current_version(connection)?;
    for version in current + 1..=SCHEMA_VERSION {
        apply_migration(connection, version)?;
    }
    Ok(())
}

/// Гарантия существования таблицы `schema_version`.
fn ensure_schema_version_table(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_version (
             version INTEGER NOT NULL PRIMARY KEY,
             applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
         );",
    )
}

/// Текущая версия схемы (0, если миграции ещё не применялись).
fn current_version(connection: &Connection) -> rusqlite::Result<i64> {
    let current: i64 = connection
        .query_row("SELECT MAX(version) FROM schema_version;", [], |row| {
            row.get(0)
        })
        .unwrap_or(0);
    Ok(current)
}

/// Применение отдельной миграции версии `version`.
fn apply_migration(connection: &mut Connection, version: i64) -> rusqlite::Result<()> {
    let transaction = connection.transaction()?;
    match version {
        1 => migration_v1(&transaction)?,
        _ => unreachable!("миграция для версии {version} не определена"),
    }
    transaction.execute(
        "INSERT INTO schema_version (version) VALUES (?1);",
        [version],
    )?;
    transaction.commit()
}

/// Миграция v1: базовые сущности каталога.
fn migration_v1(transaction: &Transaction) -> rusqlite::Result<()> {
    transaction.execute_batch(
        "CREATE TABLE IF NOT EXISTS books (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             uuid TEXT NOT NULL UNIQUE,
             title TEXT NOT NULL,
             created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
             updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
         );

         CREATE TABLE IF NOT EXISTS authors (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             name TEXT NOT NULL UNIQUE
         );

         CREATE TABLE IF NOT EXISTS series (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             name TEXT NOT NULL UNIQUE
         );

         CREATE TABLE IF NOT EXISTS tags (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             name TEXT NOT NULL UNIQUE
         );

         CREATE TABLE IF NOT EXISTS files (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
             kind TEXT NOT NULL CHECK (kind IN ('book', 'cover')),
             path TEXT NOT NULL,
             format TEXT NOT NULL
         );

         CREATE TABLE IF NOT EXISTS book_authors (
             book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
             author_id INTEGER NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
             sort_index INTEGER NOT NULL DEFAULT 0,
             PRIMARY KEY (book_id, author_id)
         );

         CREATE TABLE IF NOT EXISTS book_series (
             book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
             series_id INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
             series_index INTEGER NOT NULL DEFAULT 0,
             PRIMARY KEY (book_id, series_id)
         );

         CREATE TABLE IF NOT EXISTS book_tags (
             book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
             tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
             PRIMARY KEY (book_id, tag_id)
         );

         CREATE INDEX IF NOT EXISTS idx_files_book_id ON files(book_id);
         CREATE INDEX IF NOT EXISTS idx_book_authors_book_id ON book_authors(book_id);
         CREATE INDEX IF NOT EXISTS idx_book_series_book_id ON book_series(book_id);
         CREATE INDEX IF NOT EXISTS idx_book_tags_book_id ON book_tags(book_id);",
    )
}

#[cfg(test)]
#[path = "schema_tests.rs"]
mod tests;
