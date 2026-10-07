//! Каркас версионированного SQL-индекса source-плагина.
//!
//! Схема, миграции и запросы принадлежат плагину; ядро предоставляет только
//! opaque SQL host API в хранилище, изолированном на библиотеку. Здесь общий
//! каркас: применение миграций, перестройка схемы, ревизия каталога, прогресс и
//! хранение обложек. Уникальные для источника таблицы и `upsert` остаются в
//! плагинах.

use index_migrations::{Migration, Outcome};

use crate::fs::Fs;

/// Ключ ревизии каталога в таблице `meta`.
pub const REVISION_KEY: &str = "revision";

/// Таблица обложек книг (base64 и формат), общая для source-плагинов.
///
/// Миграция схемы индекса добавляет неизменяемую для источников таблицу
/// обложек; уникальные для источника таблицы описываются в его собственных
/// миграциях.
pub const COVERS_MIGRATION: Migration = Migration {
    version: 2,
    sql: "
CREATE TABLE IF NOT EXISTS covers (
  book_id TEXT PRIMARY KEY,
  format TEXT NOT NULL,
  mtime_ms INTEGER,
  data TEXT NOT NULL
);",
};

/// Имя прикладного события прогресса построения индекса.
pub const PROGRESS_EVENT: &str = "library-index-progress";

/// Строка таблицы `covers`.
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
pub struct CoverRow {
    /// Обложка в base64.
    pub data: String,
    /// Формат обложки.
    pub format: String,
}

/// Проверка и актуализация схемы индекса миграциями.
///
/// `legacy_state_key` — ключ устаревшего JSON-состояния, несовместимого с
/// индексом: при актуализации схемы он удаляется.
pub fn ensure_schema(
    fs: &impl Fs,
    migrations: &[Migration],
    legacy_state_key: &str,
) -> Result<(), String> {
    match run_migrations(fs, migrations) {
        Ok(Outcome::UpToDate) | Ok(Outcome::Migrated(_)) => {}
        Ok(Outcome::Rebuild) | Err(_) => rebuild_schema(fs, migrations)?,
    }
    // Прежнее JSON-состояние несовместимо: удаляем, индекс строится заново.
    fs.state_delete(legacy_state_key)?;
    Ok(())
}

/// Применение миграций к SQL-хранилищу плагина.
fn run_migrations(fs: &impl Fs, migrations: &[Migration]) -> Result<Outcome, String> {
    index_migrations::apply(
        migrations,
        |sql| fs.sql_execute(sql, "[]"),
        |sql| fs.sql_query(sql, "[]"),
    )
}

/// Полное пересоздание схемы индекса при несовместимой версии или ошибке.
fn rebuild_schema(fs: &impl Fs, migrations: &[Migration]) -> Result<(), String> {
    fs.sql_execute(
        "DROP TABLE IF EXISTS books; DROP TABLE IF EXISTS meta; DROP TABLE IF EXISTS covers; PRAGMA user_version = 0",
        "[]",
    )?;
    match run_migrations(fs, migrations)? {
        Outcome::UpToDate | Outcome::Migrated(_) => Ok(()),
        Outcome::Rebuild => Err("не удалось пересоздать схему индекса".to_string()),
    }
}

/// Чтение сохранённой обложки книги из индекса.
pub fn load_cover(fs: &impl Fs, id: &str) -> Result<Option<(String, String)>, String> {
    let params = serde_json::to_string(&[id]).map_err(|error| error.to_string())?;
    let raw = fs.sql_query(
        "SELECT data, format FROM covers WHERE book_id = ?1",
        &params,
    )?;
    let rows: Vec<CoverRow> = serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    Ok(rows
        .first()
        .map(|row| (row.data.clone(), row.format.clone())))
}

/// Сохранение обложки книги; при отсутствии обложки запись удаляется.
pub fn store_cover(
    fs: &impl Fs,
    id: &str,
    cover: Option<&(Vec<u8>, String)>,
    mtime_ms: Option<i64>,
) -> Result<(), String> {
    let Some((bytes, format)) = cover else {
        return delete_cover(fs, id);
    };
    let data = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes);
    let params = serde_json::to_string(&serde_json::json!([id, format, mtime_ms, data]))
        .map_err(|error| error.to_string())?;
    fs.sql_execute(
        "INSERT INTO covers (book_id, format, mtime_ms, data)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(book_id) DO UPDATE SET
           format = excluded.format,
           mtime_ms = excluded.mtime_ms,
           data = excluded.data",
        &params,
    )
}

/// Удаление обложки книги из индекса.
pub fn delete_cover(fs: &impl Fs, id: &str) -> Result<(), String> {
    let params = serde_json::to_string(&[id]).map_err(|error| error.to_string())?;
    fs.sql_execute("DELETE FROM covers WHERE book_id = ?1", &params)
}

/// Удаление строки книги из индекса.
pub fn delete_book(fs: &impl Fs, id: &str) -> Result<(), String> {
    let params = serde_json::to_string(&[id]).map_err(|error| error.to_string())?;
    fs.sql_execute("DELETE FROM books WHERE id = ?1", &params)
}

/// Публикация прогресса построения индекса.
pub fn emit_progress(fs: &impl Fs, done: usize, total: usize) {
    if total == 0 {
        return;
    }
    let percent = (done * 100 / total) as i64;
    let payload = serde_json::json!({ "done": done, "total": total, "percent": percent });
    let _ = fs.emit_event(PROGRESS_EVENT, &payload.to_string());
}

/// Шаг публикации прогресса: не чаще одного события на каждый шаг.
///
/// Начальное событие и завершающее публикуются всегда; для небольших индексов
/// шаг равен единице и прогресс идёт по каждой книге, для крупных — реже.
pub fn progress_stride(total: usize) -> usize {
    (total / 50).max(1)
}

/// Чтение ревизии каталога.
pub fn read_revision(fs: &impl Fs) -> Result<i64, String> {
    let raw = fs.sql_query(
        "SELECT value FROM meta WHERE key = ?1",
        &serde_json::to_string(&[REVISION_KEY]).map_err(|error| error.to_string())?,
    )?;
    let rows: Vec<serde_json::Value> =
        serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    Ok(rows
        .first()
        .and_then(|row| row.get("value"))
        .and_then(serde_json::Value::as_str)
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(0))
}

/// Запись ревизии каталога.
pub fn write_revision(fs: &impl Fs, revision: i64) -> Result<(), String> {
    let params = serde_json::to_string(&[REVISION_KEY, &revision.to_string()])
        .map_err(|error| error.to_string())?;
    fs.sql_execute(
        "INSERT INTO meta (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        &params,
    )
}
