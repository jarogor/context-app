use super::*;

use crate::models::{Note, NoteSet, PortableSet};

/// Заметка для проверки переноса полей.
fn note(id: &str, text: &str) -> Note {
    Note {
        id: id.to_string(),
        note_type: "text".to_string(),
        anchor: "a1".to_string(),
        quote: "цитата".to_string(),
        chapter: "Глава".to_string(),
        title: "Название".to_string(),
        comment: "Комментарий".to_string(),
        color: "green".to_string(),
        percent: Some(0.25),
        page: Some(7),
        text: text.to_string(),
        shape: "rectangle".to_string(),
        geometry: "{\"x\":1}".to_string(),
        created_at_millis: 500,
        updated_at_millis: 700,
    }
}

/// Набор для проверки выгрузки; ключ книги — путь хранилища отправителя.
fn set() -> NoteSet {
    NoteSet {
        id: "ns-1".to_string(),
        book_key: "/home/отправитель/Книга.epub".to_string(),
        book_title: "Книга".to_string(),
        name: "Основные".to_string(),
        created_at_millis: 100,
        notes: vec![note("note-1", "первая")],
    }
}

#[test]
fn document_keeps_book_description_and_not_its_path() {
    let text = document(&set(), "Книга.epub", 9_000).expect("документ");
    let parsed = parse_document(&text).expect("разбор документа");
    assert_eq!(parsed.book.name, "Книга.epub");
    assert_eq!(parsed.book.title, "Книга");
    assert_eq!(parsed.set.name, "Основные");
    assert_eq!(parsed.set.created_at_millis, 100);
    assert_eq!(parsed.set.notes.len(), 1);
    assert_eq!(parsed.set.notes[0].text, "первая");

    // Места хранения книги в файле нет: путь у каждого свой.
    assert!(
        !text.contains("/home/отправитель"),
        "путь книги не попадает в файл"
    );
    assert!(!text.contains("book_key"), "ключ книги не попадает в файл");
}

#[test]
fn document_carries_format_and_version() {
    let text = document(&set(), "Книга.epub", 9_000).expect("документ");
    let value: serde_json::Value = serde_json::from_str(&text).expect("JSON документа");
    assert_eq!(value["format"], "context.notes-set");
    assert_eq!(value["version"], 1);
    assert_eq!(value["exported_at_millis"], 9_000);
    assert_eq!(value["book"]["name"], "Книга.epub");
    assert_eq!(value["set"]["name"], "Основные");
}

#[test]
fn parse_accepts_file_without_envelope() {
    let portable = PortableSet {
        name: "Основные".to_string(),
        created_at_millis: 100,
        notes: vec![note("note-1", "первая")],
    };
    let text = serde_json::to_string(&portable).expect("набор");
    let parsed = parse_document(&text).expect("разбор файла без оболочки");
    assert_eq!(parsed.set.name, "Основные");
    assert_eq!(parsed.set.notes.len(), 1);
    assert_eq!(parsed.book.name, "", "книга не описана");
}

#[test]
fn parse_skips_byte_order_mark() {
    let text = format!(
        "\u{feff}{}",
        document(&set(), "Книга.epub", 1).expect("документ")
    );
    assert_eq!(
        parse_document(&text).expect("разбор с меткой").set.name,
        "Основные"
    );
}

#[test]
fn parse_rejects_foreign_format() {
    let text = r#"{ "format": "something-else", "set": { "name": "A" } }"#;
    let error = parse_document(text).expect_err("чужой формат отклонён");
    assert!(error.contains("не файл набора заметок"), "{error}");
}

#[test]
fn parse_rejects_newer_version() {
    let text = r#"{ "format": "context.notes-set", "version": 2, "set": { "name": "A" } }"#;
    let error = parse_document(text).expect_err("новая версия отклонена");
    assert!(error.contains("более новой версией"), "{error}");
}

#[test]
fn parse_rejects_empty_and_broken_text() {
    assert!(parse_document("   ").is_err());
    assert!(parse_document("не JSON").is_err());
}

#[test]
fn export_file_name_replaces_unsafe_symbols() {
    assert_eq!(export_file_name("Основные"), "Основные.notes.json");
    assert_eq!(
        export_file_name("Глава 1/2: черновик?"),
        "Глава-1-2-черновик.notes.json"
    );
    assert_eq!(export_file_name("   "), "notes.notes.json");
}

#[test]
fn export_file_name_keeps_length_bounded() {
    let name = "я".repeat(200);
    let file_name = export_file_name(&name);
    let stem = file_name.trim_end_matches(".notes.json");
    assert_eq!(stem.chars().count(), 60);
}
