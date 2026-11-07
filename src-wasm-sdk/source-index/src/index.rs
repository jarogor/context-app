//! Каркас версионированного SQL-индекса source-плагина.
//!
//! Схема, миграции и запросы принадлежат плагину; ядро предоставляет только
//! opaque SQL host API в хранилище, изолированном на библиотеку. Здесь общий
//! каркас: применение миграций, перестройка схемы, ревизия каталога, прогресс и
//! хранение обложек. Уникальные для источника таблицы и `upsert` остаются в
//! плагинах.

use sqlite_migrations::{Migration, Outcome};

use source_protocol::fs::Fs;

/// Ключ ревизии каталога в таблице `meta`.
pub const REVISION_KEY: &str = "revision";

/// Схема каталога source-плагина: книги, служебные метаданные и обложки.
///
/// Схема — одна для всех source-плагинов и сразу версия 1: приложение ещё не в
/// продакшне, цепочек версий и совместимости между ними нет. Свойства книги
/// (`язык`, `дата выхода`, `издатель`, `описание`, `идентификатор`, `размер`,
/// `время добавления`) добавлены в неё с самого начала.
pub const CATALOG_MIGRATION: Migration = Migration {
    version: 1,
    sql: "
CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  authors TEXT NOT NULL,
  tags TEXT NOT NULL,
  series TEXT NOT NULL,
  files TEXT NOT NULL,
  format TEXT NOT NULL,
  size INTEGER,
  mtime_ms INTEGER,
  added_at_ms INTEGER,
  language TEXT,
  published TEXT,
  publisher TEXT,
  description TEXT,
  identifier TEXT,
  signature TEXT
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS covers (
  book_id TEXT PRIMARY KEY,
  format TEXT NOT NULL,
  mtime_ms INTEGER,
  data TEXT NOT NULL
);",
};

/// Упорядоченный список миграций общей схемы каталога source-плагина.
pub const CATALOG_MIGRATIONS: &[Migration] = &[CATALOG_MIGRATION];

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

/// Запись книги в общей схеме каталога source-плагина.
///
/// Поля-списки (`authors`, `tags`, `series`, `files`) хранятся JSON-массивами:
/// их форма принадлежит контракту источника, а не схеме SQL. Плагин заполняет
/// то, что умеет извлечь; незаполненное остаётся `None`.
#[derive(Debug, Clone, Default, PartialEq, serde::Deserialize, serde::Serialize)]
pub struct BookRecord {
    /// Идентификатор книги внутри источника.
    pub id: String,
    /// Название книги.
    pub title: String,
    /// Авторы в виде JSON-массива строк.
    pub authors: String,
    /// Теги источника в виде JSON-массива строк.
    pub tags: String,
    /// Серии в виде JSON-массива пар «имя, номер».
    pub series: String,
    /// Файлы книги в виде JSON-массива.
    pub files: String,
    /// Формат файла содержимого.
    pub format: String,
    /// Суммарный размер файлов содержимого в байтах.
    #[serde(default)]
    pub size: Option<i64>,
    /// Время изменения файлов содержимого (Unix, мс).
    #[serde(default)]
    pub mtime_ms: Option<i64>,
    /// Когда книга впервые попала в индекс (Unix, мс).
    #[serde(default)]
    pub added_at_ms: Option<i64>,
    /// Язык книги.
    #[serde(default)]
    pub language: Option<String>,
    /// Дата выхода.
    #[serde(default)]
    pub published: Option<String>,
    /// Издатель.
    #[serde(default)]
    pub publisher: Option<String>,
    /// Описание книги.
    #[serde(default)]
    pub description: Option<String>,
    /// Идентификатор издания (ISBN).
    #[serde(default)]
    pub identifier: Option<String>,
    /// Подпись содержимого папки книги (источник с раскладкой папок).
    #[serde(default)]
    pub signature: Option<String>,
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
    sqlite_migrations::apply(
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

/// Добавление или обновление книги в индексе.
///
/// Время добавления (`added_at_ms`) фиксируется при первой вставке: правка
/// файла не переносит книгу в начало списка.
pub fn upsert_book(fs: &impl Fs, book: &BookRecord) -> Result<(), String> {
    let params = serde_json::json!([
        book.id,
        book.title,
        book.authors,
        book.tags,
        book.series,
        book.files,
        book.format,
        book.size,
        book.mtime_ms,
        book.added_at_ms,
        book.language,
        book.published,
        book.publisher,
        book.description,
        book.identifier,
        book.signature,
    ])
    .to_string();
    fs.sql_execute(
        "INSERT INTO books (id, title, authors, tags, series, files, format, size, mtime_ms,
                            added_at_ms, language, published, publisher, description,
                            identifier, signature)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           authors = excluded.authors,
           tags = excluded.tags,
           series = excluded.series,
           files = excluded.files,
           format = excluded.format,
           size = excluded.size,
           mtime_ms = excluded.mtime_ms,
           language = excluded.language,
           published = excluded.published,
           publisher = excluded.publisher,
           description = excluded.description,
           identifier = excluded.identifier,
           signature = excluded.signature,
           added_at_ms = COALESCE(books.added_at_ms, excluded.added_at_ms)",
        &params,
    )
}

/// Загрузка обложек книг пакетом: идентификатор → обложка.
///
/// Список адресуется одним запросом: список книг показывает десятки обложек
/// сразу, и вызов на книгу был бы дороже самого каталога.
pub fn load_covers(
    fs: &impl Fs,
    ids: &[String],
) -> Result<std::collections::BTreeMap<String, CoverRow>, String> {
    if ids.is_empty() {
        return Ok(std::collections::BTreeMap::new());
    }
    let placeholders = (1..=ids.len())
        .map(|index| format!("?{index}"))
        .collect::<Vec<_>>()
        .join(", ");
    let params = serde_json::to_string(ids).map_err(|error| error.to_string())?;
    let raw = fs.sql_query(
        &format!("SELECT book_id, data, format FROM covers WHERE book_id IN ({placeholders})"),
        &params,
    )?;
    let rows: Vec<CoverRowWithId> =
        serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    Ok(rows
        .into_iter()
        .map(|row| {
            (
                row.book_id,
                CoverRow {
                    data: row.data,
                    format: row.format,
                },
            )
        })
        .collect())
}

/// Строка таблицы `covers` вместе с идентификатором книги.
#[derive(Debug, Clone, serde::Deserialize)]
struct CoverRowWithId {
    /// Идентификатор книги.
    book_id: String,
    /// Обложка в base64.
    data: String,
    /// Формат обложки.
    format: String,
}

/// Загрузка всех книг индекса в порядке идентификаторов.
pub fn load_books(fs: &impl Fs) -> Result<Vec<BookRecord>, String> {
    let raw = fs.sql_query("SELECT * FROM books ORDER BY id", "[]")?;
    serde_json::from_str(&raw).map_err(|error| error.to_string())
}

/// Загрузка одной книги индекса по идентификатору.
pub fn load_book(fs: &impl Fs, id: &str) -> Result<Option<BookRecord>, String> {
    let params = serde_json::to_string(&[id]).map_err(|error| error.to_string())?;
    let raw = fs.sql_query("SELECT * FROM books WHERE id = ?1", &params)?;
    let rows: Vec<BookRecord> = serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    Ok(rows.into_iter().next())
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

#[cfg(test)]
#[path = "index_tests.rs"]
mod tests;
