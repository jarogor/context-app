use super::*;
use crate::catalog::open_catalog_at;
use crate::catalog::NewFile;
use crate::test_util;
use std::path::PathBuf;

fn temp_db(name: &str) -> PathBuf {
    let dir = test_util::test_root(name);
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

    test_util::cleanup(db_path.parent().expect("каталог теста"));
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

    test_util::cleanup(db_path.parent().expect("каталог теста"));
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
    assert!(books.iter().any(|b| b.authors[0].name == "Лев Толстой"));
    assert!(books
        .iter()
        .any(|b| b.authors[0].name == "Фёдор Достоевский"));

    test_util::cleanup(db_path.parent().expect("каталог теста"));
}

#[test]
fn get_missing_book_returns_none() {
    let db_path = temp_db("missing-book");
    let connection = open_catalog_at(&db_path).expect("открытие каталога");

    let result = get_book(&connection, 999).expect("запрос отсутствующей книги");
    assert!(result.is_none(), "отсутствующая книга не возвращается");

    test_util::cleanup(db_path.parent().expect("каталог теста"));
}

#[test]
fn search_books_matches_title_and_author_case_insensitively() {
    let db_path = temp_db("search-books");
    let mut connection = open_catalog_at(&db_path).expect("открытие каталога");
    save_book(&mut connection, new_book_fixture()).expect("сохранение первой книги");
    save_book(
        &mut connection,
        NewBook {
            title: "Анна Каренина".to_string(),
            authors: vec!["Фёдор Достоевский".to_string()],
            series: vec![],
            tags: vec![],
            files: vec![],
        },
    )
    .expect("сохранение второй книги");

    let by_title = search_books(&connection, "ВОЙНА").expect("поиск по названию");
    let by_author = search_books(&connection, "толстой").expect("поиск по автору");
    let empty = search_books(&connection, "отсутствует").expect("пустой поиск");

    assert_eq!(by_title.len(), 1);
    assert_eq!(by_author.len(), 1);
    assert_eq!(empty.len(), 0);

    test_util::cleanup(db_path.parent().expect("каталог теста"));
}
