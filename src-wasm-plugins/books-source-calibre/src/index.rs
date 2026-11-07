//! Локальный индекс каталога Calibre.
//!
//! Схема, миграции и запросы принадлежат плагину; ядро предоставляет только
//! opaque SQL host API в хранилище, изолированном на библиотеку. Общий каркас
//! индекса (миграции, ревизия, прогресс, обложки) вынесен в `source-index`.
//! Изменения папки книги определяются по подписи из имён, размеров и времён
//! изменения файлов; повторный разбор `metadata.opf`/EPUB выполняется только
//! для новых и изменённых папок. Индекс включает обложку книги, поэтому при
//! повторном открытии и запросе обложки файлы не читаются. Построение индекса
//! публикует детерминированный прогресс.

use std::collections::{HashMap, HashSet};

use serde::Deserialize;

use source_index::index::{
    delete_book, delete_cover, emit_progress, ensure_schema, load_books, load_covered_ids,
    load_covers as load_cover_rows, progress_stride, read_revision, store_cover, upsert_book,
    write_revision, BookRecord, CATALOG_MIGRATIONS,
};
use source_protocol::fs::Fs;
use source_protocol::models::{
    ExternalBook, ExternalFileKind, SourceCatalog, SOURCE_PROTOCOL_VERSION,
};

use super::models::BookListing;
use super::scanner;

/// Ключ устаревшего JSON-состояния, подлежащего удалению.
const LEGACY_STATE_KEY: &str = "calibre-state.json";

/// Строка индекса, нужная проверке изменений: идентификатор и подпись папки.
#[derive(Deserialize)]
struct ChangeRow {
    /// Идентификатор книги.
    id: String,
    /// Подпись содержимого папки книги.
    signature: String,
}

/// Актуализация индекса по текущему содержимому библиотеки.
pub(crate) fn sync(fs: &impl Fs) -> Result<SourceCatalog, String> {
    ensure_schema(fs, CATALOG_MIGRATIONS, LEGACY_STATE_KEY)?;
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
            delete_book(fs, id)?;
            delete_cover(fs, id)?;
            changed = true;
        }
    }
    let total = pending.len();
    emit_progress(fs, 0, total);
    let stride = progress_stride(total);
    for (index, listing) in pending.iter().enumerate() {
        let book = scanner::build_book(fs, listing);
        // Подпись папки хранится отдельно от свойств книги: по ней решается,
        // перечитывать ли папку при следующей синхронизации.
        write_book(fs, &book, Some(&listing.signature), listing.mtime_ms)?;
        store_cover(fs, &book.id, read_cover(fs, listing).as_ref(), None)?;
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

/// Чтение обложки книги из папки, если она там есть.
fn read_cover(fs: &impl Fs, listing: &BookListing) -> Option<(Vec<u8>, String)> {
    let cover = listing
        .files
        .iter()
        .find(|file| matches!(file.kind, ExternalFileKind::Cover))?;
    let bytes = fs.read_bytes(&cover.path).ok()?;
    Some((bytes, cover.format.clone()))
}

/// Чтение сохранённой обложки книги из индекса.
pub(crate) fn load_cover(fs: &impl Fs, id: &str) -> Result<Option<(String, String)>, String> {
    ensure_schema(fs, CATALOG_MIGRATIONS, LEGACY_STATE_KEY)?;
    source_index::index::load_cover(fs, id)
}

/// Загрузка признаков изменений книг: идентификатор и подпись папки.
fn load_rows(fs: &impl Fs) -> Result<HashMap<String, ChangeRow>, String> {
    let raw = fs.sql_query("SELECT id, signature FROM books", "[]")?;
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

/// Запись книги в индекс: свойства, файлы и подпись папки.
fn write_book(
    fs: &impl Fs,
    book: &ExternalBook,
    signature: Option<&str>,
    mtime_ms: Option<i64>,
) -> Result<(), String> {
    let record = BookRecord {
        id: book.id.clone(),
        title: book.title.clone(),
        authors: serde_json::to_string(&book.authors).map_err(|error| error.to_string())?,
        tags: serde_json::to_string(&book.tags).map_err(|error| error.to_string())?,
        files: serde_json::to_string(&book.files).map_err(|error| error.to_string())?,
        format: book
            .files
            .first()
            .map(|file| file.format.clone())
            .unwrap_or_default(),
        size: book.size.map(|value| value as i64),
        mtime_ms,
        // Время добавления ставится при первой вставке: `upsert_book` его не
        // перезаписывает.
        added_at_ms: book.added_at_ms.or_else(|| fs.now_millis()),
        language: book.language.clone(),
        published: book.published.clone(),
        publisher: book.publisher.clone(),
        description: book.description.clone(),
        identifier: book.identifier.clone(),
        signature: signature.map(str::to_string),
    };
    upsert_book(fs, &record)
}

#[cfg(test)]
#[path = "index_tests.rs"]
mod tests;
