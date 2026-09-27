//! Локальный индекс каталога generic-источника.
//!
//! Схема, миграции и запросы принадлежат плагину; ядро предоставляет только
//! opaque SQL host API в хранилище, изолированном на библиотеку. Схема
//! развивается версионированными миграциями (`index-migrations`). Индекс
//! включает метаданные книги и её обложку, поэтому при повторном открытии и
//! запросе обложки файлы не перечитываются. Изменения определяются по
//! относительному пути и метаданным файла (размер и время изменения) из
//! `fs_list_dir`. Построение индекса публикует детерминированный прогресс.

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

use index_migrations::Outcome;

use super::fs::Fs;
use super::migrations::MIGRATIONS;
use super::models::{
    ExternalBook, ExternalFile, ExternalFileKind, FileListing, SourceCatalog,
    SOURCE_PROTOCOL_VERSION,
};
use super::scanner;

/// Ключ устаревшего JSON-состояния, подлежащего удалению.
const LEGACY_STATE_KEY: &str = "library-state.json";

/// Ключ ревизии каталога в таблице `meta`.
const REVISION_KEY: &str = "revision";

/// Имя прикладного события прогресса построения индекса.
const PROGRESS_EVENT: &str = "library-index-progress";

/// Строка таблицы `books`.
#[derive(Debug, Clone, Deserialize, Serialize)]
struct BookRow {
    /// Идентификатор книги (относительный путь файла).
    id: String,
    /// Название книги.
    title: String,
    /// Авторы в виде JSON-массива.
    authors: String,
    /// Теги в виде JSON-массива.
    tags: String,
    /// Серии в виде JSON-массива пар.
    series: String,
    /// Расширение файла содержимого.
    format: String,
    /// Размер файла в байтах на момент индексации.
    size: Option<i64>,
    /// Время изменения файла на момент индексации.
    mtime_ms: Option<i64>,
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
///
/// Перечитывает только новые и изменённые файлы, удаляет исчезнувшие,
/// сохраняет обложки и публикует прогресс, возвращая согласованный snapshot.
pub(crate) fn sync(fs: &impl Fs) -> Result<SourceCatalog, String> {
    ensure_schema(fs)?;
    let existing = load_rows(fs)?;
    let listing = scanner::list_files(fs)?;
    let mut present = HashSet::new();
    let mut pending: Vec<&FileListing> = Vec::new();
    for file in &listing {
        present.insert(file.path.clone());
        let matches = file.size.is_some()
            && file.mtime_ms.is_some()
            && existing.get(&file.path).is_some_and(|row| {
                row.size == file.size.map(|value| value as i64) && row.mtime_ms == file.mtime_ms
            });
        if !matches {
            pending.push(file);
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
    for (index, file) in pending.iter().enumerate() {
        let (book, cover) = scanner::read_book(fs, &file.path);
        upsert(
            fs,
            &book,
            file.size.map(|value| value as i64),
            file.mtime_ms,
        )?;
        store_cover(fs, &book.id, cover.as_ref(), file.mtime_ms)?;
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

/// Восстановление последнего согласованного каталога без сканирования.
pub(crate) fn load_catalog(fs: &impl Fs) -> Result<SourceCatalog, String> {
    ensure_schema(fs)?;
    let revision = read_revision(fs)?;
    Ok(SourceCatalog {
        protocol_version: SOURCE_PROTOCOL_VERSION,
        revision: revision.max(0) as u64,
        books: load_books(fs)?,
    })
}

/// Полная замена каталога (портируемый режим) с новой ревизией.
pub(crate) fn write_catalog(fs: &impl Fs, books: &[ExternalBook]) -> Result<u64, String> {
    ensure_schema(fs)?;
    fs.sql_execute("DELETE FROM books; DELETE FROM covers;", "[]")?;
    for book in books {
        upsert(fs, book, None, None)?;
    }
    let revision = read_revision(fs)?.saturating_add(1).max(1);
    write_revision(fs, revision)?;
    Ok(revision as u64)
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
        "SELECT id, title, authors, tags, series, format, size, mtime_ms FROM books",
        "[]",
    )?;
    let rows: Vec<BookRow> = serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    Ok(rows.into_iter().map(|row| (row.id.clone(), row)).collect())
}

/// Загрузка каталога книг в порядке идентификаторов.
fn load_books(fs: &impl Fs) -> Result<Vec<ExternalBook>, String> {
    let raw = fs.sql_query(
        "SELECT id, title, authors, tags, series, format, size, mtime_ms FROM books ORDER BY id",
        "[]",
    )?;
    let rows: Vec<BookRow> = serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    rows.into_iter().map(row_to_book).collect()
}

/// Преобразование строки индекса в книгу нейтрального каталога.
fn row_to_book(row: BookRow) -> Result<ExternalBook, String> {
    Ok(ExternalBook {
        id: row.id.clone(),
        title: row.title,
        authors: serde_json::from_str(&row.authors).unwrap_or_default(),
        tags: serde_json::from_str(&row.tags).unwrap_or_default(),
        series: serde_json::from_str(&row.series).unwrap_or_default(),
        files: vec![ExternalFile {
            kind: ExternalFileKind::Book,
            path: row.id,
            format: row.format,
        }],
    })
}

/// Добавление или обновление строки книги в индексе.
fn upsert(
    fs: &impl Fs,
    book: &ExternalBook,
    size: Option<i64>,
    mtime_ms: Option<i64>,
) -> Result<(), String> {
    let format = book
        .files
        .first()
        .map(|file| file.format.clone())
        .unwrap_or_default();
    let params = serde_json::to_string(&serde_json::json!([
        book.id,
        book.title,
        serde_json::to_string(&book.authors).map_err(|error| error.to_string())?,
        serde_json::to_string(&book.tags).map_err(|error| error.to_string())?,
        serde_json::to_string(&book.series).map_err(|error| error.to_string())?,
        format,
        size,
        mtime_ms,
    ]))
    .map_err(|error| error.to_string())?;
    fs.sql_execute(
        "INSERT INTO books (id, title, authors, tags, series, format, size, mtime_ms)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           authors = excluded.authors,
           tags = excluded.tags,
           series = excluded.series,
           format = excluded.format,
           size = excluded.size,
           mtime_ms = excluded.mtime_ms",
        &params,
    )
}

/// Удаление строки книги из индекса.
fn delete(fs: &impl Fs, id: &str) -> Result<(), String> {
    let params = serde_json::to_string(&[id]).map_err(|error| error.to_string())?;
    fs.sql_execute("DELETE FROM books WHERE id = ?1", &params)
}

/// Сохранение обложки книги; при отсутствии обложки запись удаляется.
fn store_cover(
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
