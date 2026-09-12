use super::*;

fn in_memory_connection() -> rusqlite::Result<Connection> {
    Connection::open_in_memory()
}

#[test]
fn migrate_applies_schema_once() {
    let mut connection = in_memory_connection().expect("создание соединения");
    migrate(&mut connection).expect("применение миграций");
    let version = current_version(&connection).expect("чтение версии");
    assert_eq!(version, SCHEMA_VERSION, "версия схемы установлена");

    migrate(&mut connection).expect("повторное применение миграций");
    let version_after = current_version(&connection).expect("чтение версии");
    assert_eq!(version_after, SCHEMA_VERSION, "миграции идемпотентны");
}

#[test]
fn schema_contains_expected_tables() {
    let mut connection = in_memory_connection().expect("создание соединения");
    migrate(&mut connection).expect("применение миграций");

    let expected = [
        "schema_version",
        "books",
        "authors",
        "series",
        "tags",
        "files",
        "book_authors",
        "book_series",
        "book_tags",
    ];

    for table in expected {
        let exists: bool = connection
            .query_row(
                "SELECT EXISTS(
                     SELECT 1 FROM sqlite_master
                     WHERE type = 'table' AND name = ?1
                 );",
                [table],
                |row| row.get(0),
            )
            .expect("проверка таблицы");
        assert!(exists, "таблица {table} существует");
    }
}

#[test]
fn authors_series_tags_have_unique_names() {
    let mut connection = in_memory_connection().expect("создание соединения");
    migrate(&mut connection).expect("применение миграций");

    connection
        .execute("INSERT INTO authors (name) VALUES ('Лев Толстой');", [])
        .expect("вставка автора");

    let duplicate = connection.execute("INSERT INTO authors (name) VALUES ('Лев Толстой');", []);
    assert!(duplicate.is_err(), "дубль имени автора отклоняется");

    connection
        .execute("INSERT INTO series (name) VALUES ('Война и мир');", [])
        .expect("вставка серии");
    let duplicate_series =
        connection.execute("INSERT INTO series (name) VALUES ('Война и мир');", []);
    assert!(duplicate_series.is_err(), "дубль имени серии отклоняется");

    connection
        .execute("INSERT INTO tags (name) VALUES ('классика');", [])
        .expect("вставка тега");
    let duplicate_tag = connection.execute("INSERT INTO tags (name) VALUES ('классика');", []);
    assert!(duplicate_tag.is_err(), "дубль имени тега отклоняется");
}
