//! Тесты пользовательских свойств книг: документ, правка и удаление записи.

use std::fs;

use super::{BookProperties, BookPropertyEntry};
use crate::documents::{self, BOOK_PROPERTIES};
use crate::test_util;
use serde_json::json;

/// Правка с названием и тегами.
fn entry() -> BookPropertyEntry {
    BookPropertyEntry {
        title: Some("Уточнённое название".to_string()),
        authors: vec!["Автор".to_string()],
        tags: vec!["для диссертации".to_string()],
        ..BookPropertyEntry::default()
    }
}

#[test]
fn saves_and_loads_entries() {
    let root = test_util::test_root("book-properties-roundtrip");

    let mut properties = BookProperties::default();
    properties.set("/lib/Книга.epub", entry());
    properties.save(&root).expect("сохранение");

    let loaded = BookProperties::load(&root);
    assert_eq!(loaded.entry("/lib/Книга.epub"), Some(&entry()));
}

#[test]
fn empty_entry_removes_record() {
    let mut properties = BookProperties::default();
    properties.set("/lib/Книга.epub", entry());

    properties.set("/lib/Книга.epub", BookPropertyEntry::default());

    assert_eq!(
        properties.entry("/lib/Книга.epub"),
        None,
        "пустая правка удаляет запись"
    );
}

#[test]
fn document_carries_mark_and_version() {
    let root = test_util::test_root("book-properties-mark");
    let mut properties = BookProperties::default();
    properties.set("/lib/Книга.epub", entry());
    properties.save(&root).expect("сохранение");

    let text = fs::read_to_string(root.join("book-properties.json")).expect("файл");
    let value: serde_json::Value = serde_json::from_str(&text).expect("json");
    assert_eq!(value["format"], "context.book-properties");
    assert_eq!(value["version"], 2);
    assert_eq!(
        value["books"]["/lib/Книга.epub"]["title"],
        "Уточнённое название"
    );
}

#[test]
fn newer_document_is_rejected() {
    let root = test_util::test_root("book-properties-newer");
    fs::write(
        root.join("book-properties.json"),
        json!({
            "format": "context.book-properties",
            "version": 3,
            "books": {}
        })
        .to_string(),
    )
    .expect("файл");

    let error =
        documents::read::<BookProperties>(&root.join("book-properties.json"), &BOOK_PROPERTIES)
            .expect_err("документ новее приложения");

    assert!(error.contains("более новой версией"), "{error}");
}
