//! Версионированные миграции схемы индекса generic-источника.
//!
//! Каждая версия схемы живёт в отдельном файле и включается в общий список по
//! возрастанию версии. Новая версия добавляется новым файлом.

mod v1;

use source_index::index::COVERS_MIGRATION;
use sqlite_migrations::Migration;

/// Упорядоченный список миграций схемы индекса.
pub(crate) const MIGRATIONS: &[Migration] = &[v1::MIGRATION, COVERS_MIGRATION];
