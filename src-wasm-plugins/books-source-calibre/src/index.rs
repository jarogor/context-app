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
use super::models::BookListing;
use super::scanner;

/// Ключ устаревшего JSON-состояния, подлежащего удалению.
const LEGACY_STATE_KEY: &str = "calibre-state.json";

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
}

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
    ensure_schema(fs, MIGRATIONS, LEGACY_STATE_KEY)?;
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
        upsert(fs, &book, &listing.signature)?;
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
        books: load_books(fs)?,
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
    ensure_schema(fs, MIGRATIONS, LEGACY_STATE_KEY)?;
    source_index::index::load_cover(fs, id)
}

/// Загрузка признаков изменений книг: идентификатор и подпись папки.
fn load_rows(fs: &impl Fs) -> Result<HashMap<String, ChangeRow>, String> {
    let raw = fs.sql_query("SELECT id, signature FROM books", "[]")?;
    let rows: Vec<ChangeRow> = serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    Ok(rows.into_iter().map(|row| (row.id.clone(), row)).collect())
}

/// Загрузка каталога книг в порядке идентификаторов.
fn load_books(fs: &impl Fs) -> Result<Vec<ExternalBook>, String> {
    let raw = fs.sql_query(
        "SELECT id, title, authors, tags, series, files FROM books ORDER BY id",
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
        serde_json::Value::String(
            serde_json::to_string(&book.files).map_err(|error| error.to_string())?,
        ),
        serde_json::Value::String(signature.to_string()),
    ])
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

#[cfg(test)]
#[path = "index_tests.rs"]
mod tests;
