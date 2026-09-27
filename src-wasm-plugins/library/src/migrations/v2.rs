//! Миграция 2: хранение обложек в индексе generic-источника.

use index_migrations::Migration;

/// Таблица обложек книг (base64 и формат).
pub(super) const MIGRATION: Migration = Migration {
    version: 2,
    sql: "
CREATE TABLE IF NOT EXISTS covers (
  book_id TEXT PRIMARY KEY,
  format TEXT NOT NULL,
  mtime_ms INTEGER,
  data TEXT NOT NULL
);",
};
