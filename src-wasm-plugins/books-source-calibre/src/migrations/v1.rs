//! Миграция 1: книги и служебные метаданные индекса библиотеки Calibre.

use sqlite_migrations::Migration;

/// Исходная схема индекса: книги Calibre и ревизия каталога.
pub(super) const MIGRATION: Migration = Migration {
    version: 1,
    sql: "
CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  authors TEXT NOT NULL,
  tags TEXT NOT NULL,
  series TEXT NOT NULL,
  files TEXT NOT NULL,
  signature TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);",
};
