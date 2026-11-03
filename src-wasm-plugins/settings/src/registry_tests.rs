use super::*;
use crate::models::{FieldSchema, Schema, SectionSchema, Source};
use serde_json::json;

/// Секция без полей.
fn section(id: &str) -> SectionSchema {
    SectionSchema {
        id: id.to_string(),
        title: id.to_string(),
        description: None,
        fields: Vec::new(),
    }
}

/// Поле-флажок с названием.
fn boolean_field(key: &str, title: &str) -> FieldSchema {
    FieldSchema {
        key: key.to_string(),
        title: title.to_string(),
        field_type: "boolean".to_string(),
        description: None,
        default: Some(json!(false)),
        options: Vec::new(),
    }
}

/// Декларация владельца с указанными секциями.
fn source(owner: &str, sections: Vec<SectionSchema>) -> Source {
    Source {
        owner: owner.to_string(),
        kind: "base".to_string(),
        schema: Schema {
            title: None,
            sections,
        },
    }
}

#[test]
fn builds_full_section_identifier() {
    let registry = Registry::from_sources(&[source("books-source", vec![section("catalog")])])
        .expect("сборка реестра");
    assert_eq!(registry.sections().len(), 1);
    assert_eq!(registry.sections()[0].id, "books-source.catalog");
    assert_eq!(registry.sections()[0].owner, "books-source");
    assert!(registry.find("books-source.catalog").is_some());
}

#[test]
fn keeps_field_metadata() {
    let registry = Registry::from_sources(&[source(
        "books-source",
        vec![SectionSchema {
            id: "general".to_string(),
            title: "Общие".to_string(),
            description: None,
            fields: vec![boolean_field("enabled", "Включено")],
        }],
    )])
    .expect("сборка реестра");
    let fields = &registry.sections()[0].fields;
    assert_eq!(fields.len(), 1);
    assert_eq!(fields[0].key, "enabled");
    assert_eq!(fields[0].title, "Включено");
    assert_eq!(fields[0].field_type, "boolean");
}

#[test]
fn rejects_duplicate_full_identifier() {
    let result = Registry::from_sources(&[
        source("app", vec![section("general")]),
        source("app", vec![section("general")]),
    ]);
    assert!(result.is_err(), "дубликат отклоняется");
    assert!(
        result.expect_err("ошибка").contains("app.general"),
        "ошибка содержит идентификатор"
    );
}

#[test]
fn rejects_empty_owner() {
    let result = Registry::from_sources(&[source("  ", vec![section("general")])]);
    assert!(result.is_err(), "пустой владелец отклоняется");
}

#[test]
fn rejects_empty_section_identifier() {
    let result = Registry::from_sources(&[source("app", vec![section("")])]);
    assert!(result.is_err(), "пустой идентификатор секции отклоняется");
}
