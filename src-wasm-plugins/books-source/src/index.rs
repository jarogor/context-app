//! Локальный индекс каталога generic-источника.
//!
//! Схема, миграции и запросы принадлежат плагину; ядро предоставляет только
//! opaque SQL host API в хранилище, изолированном на библиотеку. Общий каркас
//! индекса (миграции, ревизия, прогресс, обложки) вынесен в `source-index`.
//! Индекс включает метаданные книги и её обложку, поэтому при повторном
//! открытии и запросе обложки файлы не перечитываются. Изменения определяются
//! по относительному пути и метаданным файла (размер и время изменения) из
//! `fs_list_dir`. Построение индекса публикует детерминированный прогресс.

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

use source_index::index::{
    delete_book, delete_cover, emit_progress, ensure_schema, progress_stride, read_revision,
    store_cover, write_revision,
};
use source_protocol::fs::Fs;
use source_protocol::models::{
    ExternalBook, ExternalFile, ExternalFileKind, SourceCatalog, SOURCE_PROTOCOL_VERSION,
};

use super::migrations::MIGRATIONS;
use super::models::FileListing;
use super::scanner;

/// Ключ устаревшего JSON-состояния, подлежащего удалению.
const LEGACY_STATE_KEY: &str = "library-state.json";

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
}

/// Строка индекса, нужная проверке изменений: идентификатор и метаданные файла.
#[derive(Deserialize)]
struct ChangeRow {
    /// Идентификатор книги.
    id: String,
    /// Размер файла в байтах на момент индексации.
    size: Option<i64>,
    /// Время изменения файла на момент индексации.
    mtime_ms: Option<i64>,
}

/// Актуализация индекса по текущему содержимому библиотеки.
///
/// Перечитывает только новые и изменённые файлы, удаляет исчезнувшие,
/// сохраняет обложки и публикует прогресс, возвращая согласованный snapshot.
pub(crate) fn sync(fs: &impl Fs) -> Result<SourceCatalog, String> {
    ensure_schema(fs, MIGRATIONS, LEGACY_STATE_KEY)?;
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
            delete_book(fs, id)?;
            delete_cover(fs, id)?;
            changed = true;
        }
    }
    let total = pending.len();
    emit_progress(fs, 0, total);
    let stride = progress_stride(total);
    for (index, file) in pending.iter().enumerate() {
        let (book, cover) = scanner::read_book(fs, &file.path);
        upsert(
            fs,
            &book,
            file.size.map(|value| value as i64),
            file.mtime_ms,
        )?;
        store_cover(fs, &book.id, cover.as_ref(), file.mtime_ms)?;
        let done = index + 1;
        if done % stride == 0 || done == total {
            emit_progress(fs, done, total);
        }
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
    ensure_schema(fs, MIGRATIONS, LEGACY_STATE_KEY)?;
    let revision = read_revision(fs)?;
    Ok(SourceCatalog {
        protocol_version: SOURCE_PROTOCOL_VERSION,
        revision: revision.max(0) as u64,
        books: load_books(fs)?,
    })
}

/// Полная замена каталога (портируемый режим) с новой ревизией.
pub(crate) fn write_catalog(fs: &impl Fs, books: &[ExternalBook]) -> Result<u64, String> {
    ensure_schema(fs, MIGRATIONS, LEGACY_STATE_KEY)?;
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
    ensure_schema(fs, MIGRATIONS, LEGACY_STATE_KEY)?;
    source_index::index::load_cover(fs, id)
}

/// Загрузка признаков изменений книг: идентификатор и метаданные файла.
fn load_rows(fs: &impl Fs) -> Result<HashMap<String, ChangeRow>, String> {
    let raw = fs.sql_query("SELECT id, size, mtime_ms FROM books", "[]")?;
    let rows: Vec<ChangeRow> = serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    Ok(rows.into_iter().map(|row| (row.id.clone(), row)).collect())
}

/// Загрузка каталога книг в порядке идентификаторов.
fn load_books(fs: &impl Fs) -> Result<Vec<ExternalBook>, String> {
    let raw = fs.sql_query(
        "SELECT id, title, authors, tags, series, format FROM books ORDER BY id",
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
    let params = serde_json::to_string(&vec![
        serde_json::Value::String(book.id.clone()),
        serde_json::Value::String(book.title.clone()),
        serde_json::Value::String(
            serde_json::to_string(&book.authors).map_err(|error| error.to_string())?,
        ),
        serde_json::Value::String(
            serde_json::to_string(&book.tags).map_err(|error| error.to_string())?,
        ),
        serde_json::Value::String(
            serde_json::to_string(&book.series).map_err(|error| error.to_string())?,
        ),
        serde_json::Value::String(format),
        size.map_or(serde_json::Value::Null, serde_json::Value::from),
        mtime_ms.map_or(serde_json::Value::Null, serde_json::Value::from),
    ])
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

#[cfg(test)]
#[path = "index_tests.rs"]
mod tests;
