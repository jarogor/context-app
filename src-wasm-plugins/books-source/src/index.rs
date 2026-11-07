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

use serde::Deserialize;

use source_index::index::{
    delete_book, delete_cover, emit_progress, ensure_schema, load_books, load_covered_ids,
    load_covers as load_cover_rows, progress_stride, read_revision, store_cover, upsert_book,
    write_revision, BookRecord, CATALOG_MIGRATIONS,
};
use source_protocol::fs::Fs;
use source_protocol::models::{ExternalBook, SourceCatalog, SOURCE_PROTOCOL_VERSION};

use super::models::FileListing;
use super::scanner;

/// Ключ устаревшего JSON-состояния, подлежащего удалению.
const LEGACY_STATE_KEY: &str = "library-state.json";

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
    ensure_schema(fs, CATALOG_MIGRATIONS, LEGACY_STATE_KEY)?;
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
        write_book(
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
        books: catalog_books(fs)?,
    })
}

/// Восстановление последнего согласованного каталога без сканирования.
pub(crate) fn load_catalog(fs: &impl Fs) -> Result<SourceCatalog, String> {
    ensure_schema(fs, CATALOG_MIGRATIONS, LEGACY_STATE_KEY)?;
    let revision = read_revision(fs)?;
    Ok(SourceCatalog {
        protocol_version: SOURCE_PROTOCOL_VERSION,
        revision: revision.max(0) as u64,
        books: catalog_books(fs)?,
    })
}

/// Полная замена каталога (портируемый режим) с новой ревизией.
pub(crate) fn write_catalog(fs: &impl Fs, books: &[ExternalBook]) -> Result<u64, String> {
    ensure_schema(fs, CATALOG_MIGRATIONS, LEGACY_STATE_KEY)?;
    fs.sql_execute("DELETE FROM books; DELETE FROM covers;", "[]")?;
    for book in books {
        write_book(fs, book, None, None)?;
    }
    let revision = read_revision(fs)?.saturating_add(1).max(1);
    write_revision(fs, revision)?;
    Ok(revision as u64)
}

/// Чтение сохранённой обложки книги из индекса.
pub(crate) fn load_cover(fs: &impl Fs, id: &str) -> Result<Option<(String, String)>, String> {
    ensure_schema(fs, CATALOG_MIGRATIONS, LEGACY_STATE_KEY)?;
    source_index::index::load_cover(fs, id)
}

/// Загрузка признаков изменений книг: идентификатор и метаданные файла.
fn load_rows(fs: &impl Fs) -> Result<HashMap<String, ChangeRow>, String> {
    let raw = fs.sql_query("SELECT id, size, mtime_ms FROM books", "[]")?;
    let rows: Vec<ChangeRow> = serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    Ok(rows.into_iter().map(|row| (row.id.clone(), row)).collect())
}

/// Каталог книг индекса в нейтральном представлении, в порядке идентификаторов.
fn catalog_books(fs: &impl Fs) -> Result<Vec<ExternalBook>, String> {
    // Признак обложки берётся из индекса: списку нужен флаг, а не base64.
    let covered = load_covered_ids(fs)?;
    load_books(fs)?
        .into_iter()
        .map(|record| record_to_book(record, &covered))
        .collect()
}

/// Обложки книг пакетом: идентификатор → обложка либо `null`.
///
/// Список запрашивает обложки только для видимых книг: base64 не тянется на
/// весь каталог.
pub(crate) fn covers(fs: &impl Fs, ids: &[String]) -> Result<serde_json::Value, String> {
    ensure_schema(fs, CATALOG_MIGRATIONS, LEGACY_STATE_KEY)?;
    let covers = load_cover_rows(fs, ids)?;
    let mut result = serde_json::Map::new();
    for id in ids {
        let value = match covers.get(id) {
            Some(cover) => serde_json::json!({ "data": cover.data, "format": cover.format }),
            None => serde_json::Value::Null,
        };
        result.insert(id.clone(), value);
    }
    Ok(serde_json::Value::Object(result))
}

/// Преобразование записи индекса в книгу нейтрального каталога.
fn record_to_book(
    record: BookRecord,
    covered: &std::collections::HashSet<String>,
) -> Result<ExternalBook, String> {
    let has_cover = Some(covered.contains(&record.id));
    Ok(ExternalBook {
        has_cover,
        id: record.id.clone(),
        title: record.title,
        authors: serde_json::from_str(&record.authors).unwrap_or_default(),
        tags: serde_json::from_str(&record.tags).unwrap_or_default(),
        series: serde_json::from_str(&record.series).unwrap_or_default(),
        files: serde_json::from_str(&record.files).unwrap_or_default(),
        language: record.language,
        published: record.published,
        publisher: record.publisher,
        description: record.description,
        identifier: record.identifier,
        size: record.size.map(|value| value as u64),
        added_at_ms: record.added_at_ms,
    })
}

/// Запись книги в индекс: свойства источника и метаданные файла.
fn write_book(
    fs: &impl Fs,
    book: &ExternalBook,
    size: Option<i64>,
    mtime_ms: Option<i64>,
) -> Result<(), String> {
    let record = BookRecord {
        id: book.id.clone(),
        title: book.title.clone(),
        authors: serde_json::to_string(&book.authors).map_err(|error| error.to_string())?,
        tags: serde_json::to_string(&book.tags).map_err(|error| error.to_string())?,
        series: serde_json::to_string(&book.series).map_err(|error| error.to_string())?,
        files: serde_json::to_string(&book.files).map_err(|error| error.to_string())?,
        format: book
            .files
            .first()
            .map(|file| file.format.clone())
            .unwrap_or_default(),
        size: size.or(book.size.map(|value| value as i64)),
        mtime_ms,
        // Время добавления ставится при первой вставке: `upsert_book` его не
        // перезаписывает.
        added_at_ms: book.added_at_ms.or_else(|| fs.now_millis()),
        language: book.language.clone(),
        published: book.published.clone(),
        publisher: book.publisher.clone(),
        description: book.description.clone(),
        identifier: book.identifier.clone(),
        signature: None,
    };
    upsert_book(fs, &record)
}

#[cfg(test)]
#[path = "index_tests.rs"]
mod tests;
