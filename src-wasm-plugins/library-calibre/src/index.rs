//! Локальный индекс каталога Calibre.
//!
//! Схема, миграции и запросы принадлежат плагину; ядро предоставляет только
//! opaque SQL host API в хранилище, изолированном на библиотеку. Схема
//! развивается версионированными миграциями (`index-migrations`). Изменения
//! папки книги определяются по подписи из имён, размеров и времён изменения
//! файлов; повторный разбор `metadata.opf`/EPUB выполняется только для новых и
//! изменённых папок. Индекс включает обложку книги, поэтому при повторном
//! открытии и запросе обложки файлы не читаются. Построение индекса публикует
//! детерминированный прогресс.

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

use index_migrations::Outcome;

use super::fs::Fs;
use super::migrations::MIGRATIONS;
use super::models::{
    ExternalBook, ExternalFile, ExternalFileKind, SourceCatalog, SOURCE_PROTOCOL_VERSION,
};
use super::scanner;

/// Ключ устаревшего JSON-состояния, подлежащего удалению.
const LEGACY_STATE_KEY: &str = "calibre-state.json";

/// Ключ ревизии каталога в таблице `meta`.
const REVISION_KEY: &str = "revision";

/// Имя прикладного события прогресса построения индекса.
const PROGRESS_EVENT: &str = "library-index-progress";

/// Строка таблицы `books`.
#[derive(Debug, Clone, Deserialize, Serialize)]
struct BookRow {
    /// Идентификатор книги (путь папки книги).
    id: String,
    /// Название книги.
    title: String,
    /// Авторы в виде JSON-массива.
    authors: String,
    /// Теги в виде JSON-массива.
    tags: String,
    /// Серии в виде JSON-массива пар.
    series: String,
    /// Файлы книги в виде JSON-массива.
    files: String,
    /// Подпись содержимого папки книги.
    signature: String,
}

/// Строка таблицы `covers`.
#[derive(Debug, Clone, Deserialize, Serialize)]
struct CoverRow {
    /// Обложка в base64.
    data: String,
    /// Формат обложки.
    format: String,
}

/// Актуализация индекса по текущему содержимому библиотеки.
pub(crate) fn sync(fs: &impl Fs) -> Result<SourceCatalog, String> {
    ensure_schema(fs)?;
    let existing = load_rows(fs)?;
    let listings = scanner::list_books(fs)?;
    let mut present = HashSet::new();
    let mut pending = Vec::new();
    for listing in &listings {
        present.insert(listing.id.clone());
        let matches = listing.reliable
            && existing
                .get(&listing.id)
                .is_some_and(|row| row.signature == listing.signature);
        if !matches {
            pending.push(listing);
        }
    }
    let mut changed = !pending.is_empty();
    for id in existing.keys() {
        if !present.contains(id) {
            delete(fs, id)?;
            delete_cover(fs, id)?;
            changed = true;
        }
    }
    let total = pending.len();
    emit_progress(fs, 0, total);
    for (index, listing) in pending.iter().enumerate() {
        let book = scanner::build_book(fs, listing);
        upsert(fs, &book, &listing.signature)?;
        store_cover(fs, &book.id, read_cover(fs, listing).as_ref())?;
        emit_progress(fs, index + 1, total);
    }
    let mut revision = read_revision(fs)?;
    if changed || revision == 0 {
        revision += 1;
        write_revision(fs, revision)?;
    }
    Ok(SourceCatalog {
        protocol_version: SOURCE_PROTOCOL_VERSION,
        revision: revision.max(0) as u64,
        books: load_books(fs)?,
    })
}

/// Чтение обложки книги из папки, если она там есть.
fn read_cover(fs: &impl Fs, listing: &super::models::BookListing) -> Option<(Vec<u8>, String)> {
    let cover = listing
        .files
        .iter()
        .find(|file| matches!(file.kind, ExternalFileKind::Cover))?;
    let bytes = fs.read_bytes(&cover.path).ok()?;
    Some((bytes, cover.format.clone()))
}

/// Чтение сохранённой обложки книги из индекса.
pub(crate) fn load_cover(fs: &impl Fs, id: &str) -> Result<Option<(String, String)>, String> {
    ensure_schema(fs)?;
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

/// Проверка и актуализация схемы индекса миграциями.
fn ensure_schema(fs: &impl Fs) -> Result<(), String> {
    match run_migrations(fs) {
        Ok(Outcome::UpToDate) | Ok(Outcome::Migrated(_)) => {}
        Ok(Outcome::Rebuild) | Err(_) => rebuild_schema(fs)?,
    }
    // Прежнее JSON-состояние несовместимо: удаляем, индекс строится заново.
    fs.state_delete(LEGACY_STATE_KEY)?;
    Ok(())
}

/// Применение миграций к SQL-хранилищу плагина.
fn run_migrations(fs: &impl Fs) -> Result<Outcome, String> {
    index_migrations::apply(
        MIGRATIONS,
        |sql| fs.sql_execute(sql, "[]"),
        |sql| fs.sql_query(sql, "[]"),
    )
}

/// Полное пересоздание схемы индекса при несовместимой версии или ошибке.
fn rebuild_schema(fs: &impl Fs) -> Result<(), String> {
    fs.sql_execute(
        "DROP TABLE IF EXISTS books; DROP TABLE IF EXISTS meta; DROP TABLE IF EXISTS covers; PRAGMA user_version = 0",
        "[]",
    )?;
    match run_migrations(fs)? {
        Outcome::UpToDate | Outcome::Migrated(_) => Ok(()),
        Outcome::Rebuild => Err("не удалось пересоздать схему индекса".to_string()),
    }
}

/// Загрузка всех строк индекса по идентификатору книги.
fn load_rows(fs: &impl Fs) -> Result<HashMap<String, BookRow>, String> {
    let raw = fs.sql_query(
        "SELECT id, title, authors, tags, series, files, signature FROM books",
        "[]",
    )?;
    let rows: Vec<BookRow> = serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    Ok(rows.into_iter().map(|row| (row.id.clone(), row)).collect())
}

/// Загрузка каталога книг в порядке идентификаторов.
fn load_books(fs: &impl Fs) -> Result<Vec<ExternalBook>, String> {
    let raw = fs.sql_query(
        "SELECT id, title, authors, tags, series, files, signature FROM books ORDER BY id",
        "[]",
    )?;
    let rows: Vec<BookRow> = serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    rows.into_iter().map(row_to_book).collect()
}

/// Преобразование строки индекса в книгу нейтрального каталога.
fn row_to_book(row: BookRow) -> Result<ExternalBook, String> {
    Ok(ExternalBook {
        id: row.id,
        title: row.title,
        authors: serde_json::from_str(&row.authors).unwrap_or_default(),
        tags: serde_json::from_str(&row.tags).unwrap_or_default(),
        series: serde_json::from_str(&row.series).unwrap_or_default(),
        files: serde_json::from_str::<Vec<ExternalFile>>(&row.files).unwrap_or_default(),
    })
}

/// Добавление или обновление строки книги в индексе.
fn upsert(fs: &impl Fs, book: &ExternalBook, signature: &str) -> Result<(), String> {
    let params = serde_json::to_string(&serde_json::json!([
        book.id,
        book.title,
        serde_json::to_string(&book.authors).map_err(|error| error.to_string())?,
        serde_json::to_string(&book.tags).map_err(|error| error.to_string())?,
        serde_json::to_string(&book.series).map_err(|error| error.to_string())?,
        serde_json::to_string(&book.files).map_err(|error| error.to_string())?,
        signature,
    ]))
    .map_err(|error| error.to_string())?;
    fs.sql_execute(
        "INSERT INTO books (id, title, authors, tags, series, files, signature)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           authors = excluded.authors,
           tags = excluded.tags,
           series = excluded.series,
           files = excluded.files,
           signature = excluded.signature",
        &params,
    )
}

/// Удаление строки книги из индекса.
fn delete(fs: &impl Fs, id: &str) -> Result<(), String> {
    let params = serde_json::to_string(&[id]).map_err(|error| error.to_string())?;
    fs.sql_execute("DELETE FROM books WHERE id = ?1", &params)
}

/// Сохранение обложки книги; при отсутствии обложки запись удаляется.
fn store_cover(fs: &impl Fs, id: &str, cover: Option<&(Vec<u8>, String)>) -> Result<(), String> {
    let Some((bytes, format)) = cover else {
        return delete_cover(fs, id);
    };
    let data = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes);
    let params = serde_json::to_string(&serde_json::json!([id, format, data]))
        .map_err(|error| error.to_string())?;
    fs.sql_execute(
        "INSERT INTO covers (book_id, format, mtime_ms, data)
         VALUES (?1, ?2, NULL, ?3)
         ON CONFLICT(book_id) DO UPDATE SET
           format = excluded.format,
           mtime_ms = excluded.mtime_ms,
           data = excluded.data",
        &params,
    )
}

/// Удаление обложки книги из индекса.
fn delete_cover(fs: &impl Fs, id: &str) -> Result<(), String> {
    let params = serde_json::to_string(&[id]).map_err(|error| error.to_string())?;
    fs.sql_execute("DELETE FROM covers WHERE book_id = ?1", &params)
}

/// Публикация прогресса построения индекса.
fn emit_progress(fs: &impl Fs, done: usize, total: usize) {
    if total == 0 {
        return;
    }
    let percent = (done * 100 / total) as i64;
    let payload = serde_json::json!({ "done": done, "total": total, "percent": percent });
    let _ = fs.emit_event(PROGRESS_EVENT, &payload.to_string());
}

/// Чтение ревизии каталога.
fn read_revision(fs: &impl Fs) -> Result<i64, String> {
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
fn write_revision(fs: &impl Fs, revision: i64) -> Result<(), String> {
    let params = serde_json::to_string(&[REVISION_KEY, &revision.to_string()])
        .map_err(|error| error.to_string())?;
    fs.sql_execute(
        "INSERT INTO meta (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        &params,
    )
}

#[cfg(test)]
#[path = "index_tests.rs"]
mod tests;
