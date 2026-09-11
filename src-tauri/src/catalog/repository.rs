//! Репозиторий каталога: сохранение и чтение книг со связями.

use rusqlite::{Connection, Transaction};

use crate::catalog::FileKind;

use super::error::CatalogError;
use super::entities::{
  Author, Book, BookFile, NewBook, Series, SeriesLink, Tag,
};

/// Вставка базовой строки книги в транзакции.
pub(crate) fn insert_book(
    transaction: &Transaction,
    uuid: &str,
    title: &str,
) -> Result<i64, CatalogError> {
    transaction.execute(
        "INSERT INTO books (uuid, title) VALUES (?1, ?2);",
        rusqlite::params![uuid, title.trim()],
    )?;
    Ok(transaction.last_insert_rowid())
}

/// Вставка записи файла книги в транзакции.
pub(crate) fn insert_file(
    transaction: &Transaction,
    book_id: i64,
    kind: FileKind,
    path: &str,
    format: &str,
) -> Result<(), CatalogError> {
    transaction.execute(
        "INSERT INTO files (book_id, kind, path, format)
         VALUES (?1, ?2, ?3, ?4);",
        rusqlite::params![book_id, kind.as_str(), path, format],
    )?;
    Ok(())
}

/// Сохранение новой книги вместе с авторами, сериями, тегами и файлами.
///
/// Операция выполняется транзакционно: при ошибке изменения не сохраняются.
pub fn save_book(
    connection: &mut Connection,
    new_book: NewBook,
) -> Result<Book, CatalogError> {
    let transaction = connection.transaction()?;

    let uuid = uuid::Uuid::new_v4().to_string();
    let author_ids = resolve_author_ids(&transaction, &new_book.authors)?;
    let series_ids = resolve_series_ids(&transaction, &new_book.series)?;
    let tag_ids = resolve_tag_ids(&transaction, &new_book.tags)?;

    let book_id = insert_book(&transaction, &uuid, &new_book.title)?;

    link_authors(&transaction, book_id, &author_ids)?;
    link_series(&transaction, book_id, &series_ids, &new_book.series)?;
    link_tags(&transaction, book_id, &tag_ids)?;

    for file in &new_book.files {
        insert_file(
            &transaction,
            book_id,
            file.kind,
            &file.path,
            &file.format,
        )?;
    }

    transaction.commit()?;

    get_book(connection, book_id)
        .map(|book| book.expect("только что созданная книга существует"))
}

/// Поиск книги по идентификатору со всеми связями.
pub fn get_book(
    connection: &Connection,
    book_id: i64,
) -> Result<Option<Book>, CatalogError> {
    let book = load_book_row(connection, book_id)?;
    let Some(mut book) = book else {
        return Ok(None);
    };
    book.authors = load_authors(connection, book_id)?;
    book.series = load_series(connection, book_id)?;
    book.tags = load_tags(connection, book_id)?;
    book.files = load_files(connection, book_id)?;
    Ok(Some(book))
}

/// Список всех книг каталога со связями, упорядоченный по названию.
pub fn list_books(connection: &Connection) -> Result<Vec<Book>, CatalogError> {
    let mut statement = connection.prepare(
        "SELECT id, uuid, title, created_at, updated_at
         FROM books
         ORDER BY title COLLATE NOCASE;",
    )?;

    let rows: Vec<(i64, String, String, String, String)> = statement
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
            ))
        })?
        .collect::<Result<_, _>>()?;

    let mut books = Vec::with_capacity(rows.len());
    for (id, uuid, title, created_at, updated_at) in rows {
        let mut book = Book {
            id,
            uuid,
            title,
            created_at,
            updated_at,
            authors: Vec::new(),
            series: Vec::new(),
            tags: Vec::new(),
            files: Vec::new(),
        };
        book.authors = load_authors(connection, id)?;
        book.series = load_series(connection, id)?;
        book.tags = load_tags(connection, id)?;
        book.files = load_files(connection, id)?;
        books.push(book);
    }

    Ok(books)
}

/// Получение или создание записи автора по имени.
pub(crate) fn get_or_create_author(
    transaction: &Transaction,
    name: &str,
) -> Result<i64, CatalogError> {
    let trimmed = name.trim();
    if let Some(id) = find_id(transaction, "authors", "name", trimmed)? {
        return Ok(id);
    }
    transaction.execute(
        "INSERT INTO authors (name) VALUES (?1);",
        [trimmed],
    )?;
    Ok(transaction.last_insert_rowid())
}

/// Получение или создание записи серии по имени.
pub(crate) fn get_or_create_series(
    transaction: &Transaction,
    name: &str,
) -> Result<i64, CatalogError> {
    let trimmed = name.trim();
    if let Some(id) = find_id(transaction, "series", "name", trimmed)? {
        return Ok(id);
    }
    transaction.execute(
        "INSERT INTO series (name) VALUES (?1);",
        [trimmed],
    )?;
    Ok(transaction.last_insert_rowid())
}

/// Получение или создание записи тега по имени.
pub(crate) fn get_or_create_tag(
    transaction: &Transaction,
    name: &str,
) -> Result<i64, CatalogError> {
    let trimmed = name.trim();
    if let Some(id) = find_id(transaction, "tags", "name", trimmed)? {
        return Ok(id);
    }
    transaction.execute(
        "INSERT INTO tags (name) VALUES (?1);",
        [trimmed],
    )?;
    Ok(transaction.last_insert_rowid())
}

/// Поиск идентификатора записи по уникальному имени.
fn find_id(
    connection: &Connection,
    table: &str,
    column: &str,
    value: &str,
) -> Result<Option<i64>, CatalogError> {
    let sql = format!(
        "SELECT id FROM {table} WHERE {column} = ?1;"
    );
    let mut statement = connection.prepare(&sql)?;
    let mut rows = statement.query_map([value], |row| row.get(0))?;
    match rows.next() {
        Some(Ok(id)) => Ok(Some(id)),
        Some(Err(err)) => Err(err.into()),
        None => Ok(None),
    }
}

/// Разрешение всех авторов в идентификаторы.
pub(crate) fn resolve_author_ids(
    transaction: &Transaction,
    names: &[String],
) -> Result<Vec<i64>, CatalogError> {
    names
        .iter()
        .map(|name| get_or_create_author(transaction, name))
        .collect()
}

/// Разрешение пар (имя серии, серия, индекс) в идентификаторы серий.
fn resolve_series_ids(
    transaction: &Transaction,
    series: &[(String, i64)],
) -> Result<Vec<i64>, CatalogError> {
    series
        .iter()
        .map(|(name, _)| get_or_create_series(transaction, name))
        .collect()
}

/// Разрешение всех тегов в идентификаторы.
fn resolve_tag_ids(
    transaction: &Transaction,
    names: &[String],
) -> Result<Vec<i64>, CatalogError> {
    names
        .iter()
        .map(|name| get_or_create_tag(transaction, name))
        .collect()
}

/// Связывание книги с авторами.
pub(crate) fn link_authors(
    transaction: &Transaction,
    book_id: i64,
    author_ids: &[i64],
) -> Result<(), CatalogError> {
    for (index, author_id) in author_ids.iter().enumerate() {
        transaction.execute(
            "INSERT INTO book_authors (book_id, author_id, sort_index)
             VALUES (?1, ?2, ?3);",
            rusqlite::params![book_id, author_id, index as i64],
        )?;
    }
    Ok(())
}

/// Связывание книги с сериями и порядковыми номерами.
fn link_series(
    transaction: &Transaction,
    book_id: i64,
    series_ids: &[i64],
    series: &[(String, i64)],
) -> Result<(), CatalogError> {
    for (index, series_id) in series_ids.iter().enumerate() {
        let (_, series_index) = &series[index];
        transaction.execute(
            "INSERT INTO book_series (book_id, series_id, series_index)
             VALUES (?1, ?2, ?3);",
            rusqlite::params![book_id, series_id, series_index],
        )?;
    }
    Ok(())
}

/// Связывание книги с тегами.
fn link_tags(
    transaction: &Transaction,
    book_id: i64,
    tag_ids: &[i64],
) -> Result<(), CatalogError> {
    for tag_id in tag_ids {
        transaction.execute(
            "INSERT INTO book_tags (book_id, tag_id) VALUES (?1, ?2);",
            rusqlite::params![book_id, tag_id],
        )?;
    }
    Ok(())
}

/// Чтение базовой строки книги без связей.
fn load_book_row(
    connection: &Connection,
    book_id: i64,
) -> Result<Option<Book>, CatalogError> {
    let mut statement = connection.prepare(
        "SELECT id, uuid, title, created_at, updated_at
         FROM books WHERE id = ?1;",
    )?;
    let mut rows = statement.query_map([book_id], |row| {
        Ok(Book {
            id: row.get(0)?,
            uuid: row.get(1)?,
            title: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
            authors: Vec::new(),
            series: Vec::new(),
            tags: Vec::new(),
            files: Vec::new(),
        })
    })?;

    match rows.next() {
        Some(Ok(book)) => Ok(Some(book)),
        Some(Err(err)) => Err(err.into()),
        None => Ok(None),
    }
}

/// Чтение авторов книги.
fn load_authors(
    connection: &Connection,
    book_id: i64,
) -> Result<Vec<Author>, CatalogError> {
    let mut statement = connection.prepare(
        "SELECT a.id, a.name
         FROM authors a
         JOIN book_authors ba ON ba.author_id = a.id
         WHERE ba.book_id = ?1
         ORDER BY ba.sort_index;",
    )?;
    let authors = statement
        .query_map([book_id], |row| {
            Ok(Author {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(authors)
}

/// Чтение серий книги с порядковыми номерами.
fn load_series(
    connection: &Connection,
    book_id: i64,
) -> Result<Vec<SeriesLink>, CatalogError> {
    let mut statement = connection.prepare(
        "SELECT s.id, s.name, bs.series_index
         FROM series s
         JOIN book_series bs ON bs.series_id = s.id
         WHERE bs.book_id = ?1
         ORDER BY bs.series_index;",
    )?;
    let series = statement
        .query_map([book_id], |row| {
            Ok(SeriesLink {
                series: Series {
                    id: row.get(0)?,
                    name: row.get(1)?,
                },
                series_index: row.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(series)
}

/// Чтение тегов книги.
fn load_tags(
    connection: &Connection,
    book_id: i64,
) -> Result<Vec<Tag>, CatalogError> {
    let mut statement = connection.prepare(
        "SELECT t.id, t.name
         FROM tags t
         JOIN book_tags bt ON bt.tag_id = t.id
         WHERE bt.book_id = ?1
         ORDER BY t.name COLLATE NOCASE;",
    )?;
    let tags = statement
        .query_map([book_id], |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(tags)
}

/// Чтение файлов книги.
fn load_files(
    connection: &Connection,
    book_id: i64,
) -> Result<Vec<BookFile>, CatalogError> {
    let mut statement = connection.prepare(
        "SELECT id, book_id, kind, path, format
         FROM files
         WHERE book_id = ?1
         ORDER BY kind, id;",
    )?;
    let files = statement
        .query_map([book_id], |row| {
            let kind_str: String = row.get(2)?;
            let kind = match kind_str.as_str() {
                "cover" => FileKind::Cover,
                _ => FileKind::Book,
            };
            Ok(BookFile {
                id: row.get(0)?,
                book_id: row.get(1)?,
                kind,
                path: row.get(3)?,
                format: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog::open_catalog_at;
    use crate::catalog::NewFile;
    use std::env;
    use std::fs;
    use std::path::PathBuf;

    fn temp_db(name: &str) -> PathBuf {
        let dir = env::temp_dir()
            .join("jarogor-booklib-tests")
            .join(name);
        if dir.exists() {
            fs::remove_dir_all(&dir).expect("очистка временной директории");
        }
        fs::create_dir_all(&dir).expect("создание временной директории");
        dir.join("library.db")
    }

    fn new_book_fixture() -> NewBook {
        NewBook {
            title: "Война и мир".to_string(),
            authors: vec!["Лев Толстой".to_string()],
            series: vec![("Большая проза".to_string(), 1)],
            tags: vec!["классика".to_string(), "русская".to_string()],
            files: vec![
                NewFile {
                    kind: FileKind::Book,
                    path: "books/1.epub".to_string(),
                    format: "epub".to_string(),
                },
                NewFile {
                    kind: FileKind::Cover,
                    path: "covers/1.jpg".to_string(),
                    format: "jpg".to_string(),
                },
            ],
        }
    }

    #[test]
    fn save_and_load_book_with_all_relations() {
        let db_path = temp_db("save-and-load");
        let mut connection = open_catalog_at(&db_path).expect("открытие каталога");

        let saved = save_book(&mut connection, new_book_fixture()).expect("сохранение книги");

        assert!(saved.id > 0, "идентификатор назначен");
        assert_eq!(saved.title, "Война и мир");
        assert_eq!(saved.authors.len(), 1);
        assert_eq!(saved.authors[0].name, "Лев Толстой");
        assert_eq!(saved.series.len(), 1);
        assert_eq!(saved.series[0].series.name, "Большая проза");
        assert_eq!(saved.series[0].series_index, 1);
        assert_eq!(saved.tags.len(), 2);
        assert_eq!(saved.files.len(), 2);

        let loaded = get_book(&connection, saved.id)
            .expect("чтение книги")
            .expect("книга существует");
        assert_eq!(loaded.title, saved.title);
        assert_eq!(loaded.authors[0].name, "Лев Толстой");
        assert_eq!(loaded.series[0].series_index, 1);
        assert_eq!(loaded.tags.len(), 2);
        assert_eq!(loaded.files.len(), 2);
        assert!(loaded
            .files
            .iter()
            .any(|f| f.kind == FileKind::Cover && f.path == "covers/1.jpg"));

        fs::remove_dir_all(
            env::temp_dir().join("jarogor-booklib-tests").join("save-and-load"),
        )
        .expect("очистка");
    }

    #[test]
    fn save_reuses_existing_author_series_tag() {
        let db_path = temp_db("reuse-relations");
        let mut connection = open_catalog_at(&db_path).expect("открытие каталога");

        save_book(&mut connection, new_book_fixture()).expect("сохранение первой книги");
        let second = NewBook {
            title: "Анна Каренина".to_string(),
            authors: vec!["Лев Толстой".to_string()],
            series: vec![("Большая проза".to_string(), 2)],
            tags: vec!["классика".to_string()],
            files: vec![],
        };
        save_book(&mut connection, second).expect("сохранение второй книги");

        let count_authors: i64 = connection
            .query_row("SELECT COUNT(*) FROM authors;", [], |row| row.get(0))
            .expect("число авторов");
        assert_eq!(count_authors, 1, "автор переиспользован");

        let count_series: i64 = connection
            .query_row("SELECT COUNT(*) FROM series;", [], |row| row.get(0))
            .expect("число серий");
        assert_eq!(count_series, 1, "серия переиспользована");

        fs::remove_dir_all(
            env::temp_dir().join("jarogor-booklib-tests").join("reuse-relations"),
        )
        .expect("очистка");
    }

    #[test]
    fn list_books_returns_all_books_with_relations() {
        let db_path = temp_db("list-books");
        let mut connection = open_catalog_at(&db_path).expect("открытие каталога");

        save_book(&mut connection, new_book_fixture()).expect("сохранение книги");
        save_book(
            &mut connection,
            NewBook {
                title: "Преступление и наказание".to_string(),
                authors: vec!["Фёдор Достоевский".to_string()],
                series: vec![],
                tags: vec!["классика".to_string()],
                files: vec![],
            },
        )
        .expect("сохранение второй книги");

        let books = list_books(&connection).expect("список книг");
        assert_eq!(books.len(), 2, "обе книги в списке");
        assert!(books
            .iter()
            .any(|b| b.authors[0].name == "Лев Толстой"));
        assert!(books
            .iter()
            .any(|b| b.authors[0].name == "Фёдор Достоевский"));

        fs::remove_dir_all(
            env::temp_dir().join("jarogor-booklib-tests").join("list-books"),
        )
        .expect("очистка");
    }

    #[test]
    fn get_missing_book_returns_none() {
        let db_path = temp_db("missing-book");
        let connection = open_catalog_at(&db_path).expect("открытие каталога");

        let result = get_book(&connection, 999).expect("запрос отсутствующей книги");
        assert!(result.is_none(), "отсутствующая книга не возвращается");

        fs::remove_dir_all(
            env::temp_dir().join("jarogor-booklib-tests").join("missing-book"),
        )
        .expect("очистка");
    }
}