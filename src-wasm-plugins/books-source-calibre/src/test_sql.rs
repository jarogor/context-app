//! Нативный SQL-движок для тестов плагина.
//!
//! Общая реализация живёт в `sqlite-test-harness::test_sql` (dev-зависимость).
//! Здесь — реэкспорт под привычным `crate::test_sql`.

pub(crate) use sqlite_test_harness::test_sql::{execute, query};
