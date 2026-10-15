//! Версионированные миграции схемы SQLite-хранилища плагинов.
//!
//! Схема индекса принадлежит плагину, а исполнение SQL — ядру (opaque SQL host
//! API). Модуль не зависит от конкретного `Fs`-трейта: он принимает замыкания
//! `execute`/`query`. Миграции применяются по возрастанию версии к
//! `PRAGMA user_version`; версия фиксируется только после успешного применения,
//! а ошибка или более новая сохранённая версия означают необходимость полной
//! перестройки индекса.

use std::fmt;

/// Одна миграция схемы.
#[derive(Debug, Clone, Copy)]
pub struct Migration {
    /// Версия схемы после применения миграции.
    pub version: i64,
    /// SQL-скрипт миграции (может содержать несколько выражений).
    pub sql: &'static str,
}

/// Результат применения миграций.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    /// Схема уже на актуальной версии.
    UpToDate,
    /// Схема обновлена до указанной версии.
    Migrated(i64),
    /// Сохранённая версия новее поддерживаемой — нужна полная перестройка.
    Rebuild,
}

impl fmt::Display for Outcome {
    /// Форматирование результата для диагностики.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Outcome::UpToDate => write!(f, "схема актуальна"),
            Outcome::Migrated(version) => write!(f, "схема обновлена до версии {version}"),
            Outcome::Rebuild => write!(f, "нужна полная перестройка индекса"),
        }
    }
}

/// Наибольшая версия среди миграций (0, если список пуст).
pub fn latest_version(migrations: &[Migration]) -> i64 {
    migrations
        .iter()
        .map(|migration| migration.version)
        .max()
        .unwrap_or(0)
}

/// Применение миграций к SQL-хранилищу.
///
/// `execute` исполняет SQL без параметров, `query` читает `PRAGMA user_version`.
/// Каждая миграция применяется в транзакции; при ошибке транзакция
/// откатывается, а версия остаётся прежней.
pub fn apply<E, Q>(migrations: &[Migration], execute: E, query: Q) -> Result<Outcome, String>
where
    E: Fn(&str) -> Result<(), String>,
    Q: Fn(&str) -> Result<String, String>,
{
    let latest = latest_version(migrations);
    let current = read_version(&query)?;
    if current > latest {
        return Ok(Outcome::Rebuild);
    }
    let mut pending: Vec<&Migration> = migrations
        .iter()
        .filter(|migration| migration.version > current)
        .collect();
    if pending.is_empty() {
        return Ok(Outcome::UpToDate);
    }
    pending.sort_by_key(|migration| migration.version);
    let mut version = current;
    for migration in pending {
        execute("BEGIN")?;
        if let Err(error) = execute(migration.sql) {
            let _ = execute("ROLLBACK");
            return Err(error);
        }
        if let Err(error) = execute(&format!("PRAGMA user_version = {}", migration.version)) {
            let _ = execute("ROLLBACK");
            return Err(error);
        }
        execute("COMMIT")?;
        version = migration.version;
    }
    Ok(Outcome::Migrated(version))
}

/// Чтение текущей версии схемы из `PRAGMA user_version`.
fn read_version<Q>(query: &Q) -> Result<i64, String>
where
    Q: Fn(&str) -> Result<String, String>,
{
    let raw = query("PRAGMA user_version")?;
    let rows: Vec<serde_json::Value> =
        serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    Ok(rows
        .first()
        .and_then(|row| row.get("user_version"))
        .and_then(serde_json::Value::as_i64)
        .unwrap_or(0))
}

#[cfg(test)]
#[path = "lib_tests.rs"]
mod tests;
