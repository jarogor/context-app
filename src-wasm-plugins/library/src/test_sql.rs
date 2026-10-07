//! Нативный SQL-движок для тестов плагина.
//!
//! Общая реализация живёт в `source-common::test_sql` под feature `test-sql`,
//! включаемой dev-зависимостью. Здесь — реэкспорт под привычным `crate::test_sql`.

pub(crate) use source_common::test_sql::{execute, query};
