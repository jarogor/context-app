//! Миграция 1: книги и служебные метаданные индекса generic-источника.

use index_migrations::Migration;

/// Исходная схема индекса: книги и ревизия каталога.
pub(super) const MIGRATION: Migration = Migration {
    version: 1,
    sql: "
CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  authors TEXT NOT NULL,
  tags TEXT NOT NULL,
  series TEXT NOT NULL,
  format TEXT NOT NULL,
  size INTEGER,
  mtime_ms INTEGER
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);",
};
