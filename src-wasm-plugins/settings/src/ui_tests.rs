use super::*;

use serde_json::json;

use crate::models::{FieldOption, FieldSchema, RegisteredSection};

/// Секция с одним полем заданного типа.
fn section_with(field: FieldSchema) -> RegisteredSection {
    RegisteredSection {
        id: "app.general".to_string(),
        owner: "app".to_string(),
        kind: "app".to_string(),
        title: "Общие".to_string(),
        description: Some("Общие параметры".to_string()),
        fields: vec![field],
    }
}

/// Поле секции.
fn field(key: &str, title: &str, field_type: &str) -> FieldSchema {
    FieldSchema {
        key: key.to_string(),
        title: title.to_string(),
        field_type: field_type.to_string(),
        description: None,
        default: None,
        options: Vec::new(),
    }
}

/// Поиск узла декларации по имени компонента среди верхнего уровня.
fn find_node<'a>(declaration: &'a Declaration, kind: &str) -> &'a Value {
    declaration
        .nodes
        .iter()
        .find(|node| node["type"] == kind)
        .expect("узел присутствует")
}

#[test]
fn boolean_field_becomes_checkbox_with_autosave() {
    let section = section_with(field("flag", "Флаг", "boolean"));
    let declaration = section_declaration(&section, &json!({ "flag": true }));
    let node = find_node(&declaration, "Checkbox");
    assert_eq!(node["props"]["name"], "flag");
    assert_eq!(node["props"]["label"], "Флаг");
    assert_eq!(node["props"]["checked"], true);
    assert_eq!(node["on"]["change"], ACTION_SAVE);
}

#[test]
fn select_field_carries_options() {
    let mut select = field("level", "Порог", "select");
    select.options = vec![
        FieldOption {
            value: json!("info"),
            title: "Информация".to_string(),
        },
        FieldOption {
            value: json!("trace"),
            title: "Всё".to_string(),
        },
    ];
    let section = section_with(select);
    let declaration = section_declaration(&section, &json!({ "level": "info" }));
    let node = find_node(&declaration, "Select");
    assert_eq!(node["props"]["value"], "info");
    assert_eq!(node["props"]["options"][0]["value"], "info");
    assert_eq!(node["props"]["options"][1]["title"], "Всё");
    assert_eq!(node["on"]["change"], ACTION_SAVE);
}

#[test]
fn json_field_becomes_textarea_with_pretty_json() {
    let section = section_with(field("extra", "Данные", "json"));
    let declaration = section_declaration(&section, &json!({ "extra": { "a": 1 } }));
    let node = find_node(&declaration, "Textarea");
    assert_eq!(node["props"]["name"], "extra");
    assert_eq!(node["props"]["value"], "{\n  \"a\": 1\n}");
}

#[test]
fn section_has_heading_text_and_save_button() {
    let section = section_with(field("name", "Имя", "string"));
    let declaration = section_declaration(&section, &json!({ "name": "значение" }));
    assert_eq!(declaration.title.as_deref(), Some("Общие"));
    assert_eq!(declaration.description.as_deref(), Some("Общие параметры"));
    assert_eq!(find_node(&declaration, "Heading")["props"]["text"], "Общие");
    assert_eq!(
        find_node(&declaration, "Text")["props"]["text"],
        "Общие параметры"
    );
    let button = declaration
        .nodes
        .iter()
        .find(|node| node["type"] == "Button")
        .expect("кнопка сохранения");
    assert_eq!(button["on"]["click"], ACTION_SAVE);
}

#[test]
fn number_field_becomes_number_input() {
    let section = section_with(field("count", "Количество", "number"));
    let declaration = section_declaration(&section, &json!({ "count": 5 }));
    let node = find_node(&declaration, "Input");
    assert_eq!(node["props"]["type"], "number");
    assert_eq!(node["props"]["value"], "5");
}

#[test]
fn number_field_drops_trailing_fraction() {
    let section = section_with(field("count", "Количество", "number"));
    // Ранее сохранённое значение-дробь `50.0` показывается как целое `50`.
    let declaration = section_declaration(&section, &json!({ "count": 50.0 }));
    let node = find_node(&declaration, "Input");
    assert_eq!(node["props"]["value"], "50");
}
