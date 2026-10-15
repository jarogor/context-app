use super::*;

use serde_json::json;

#[test]
fn text_node_has_discriminant_and_value() {
    assert_eq!(
        text("Привет"),
        json!({ "type": "#text", "value": "Привет" })
    );
}

#[test]
fn element_without_optional_parts_omits_them() {
    let node = Element::new("Card").build();
    assert_eq!(node, json!({ "type": "Card" }));
}

#[test]
fn element_collects_props_actions_children() {
    let node = Element::new("Checkbox")
        .prop("name", "flag")
        .prop("checked", true)
        .prop("label", "Флаг")
        .action("change", "save")
        .build();
    assert_eq!(
        node,
        json!({
            "type": "Checkbox",
            "props": { "name": "flag", "checked": true, "label": "Флаг" },
            "on": { "change": "save" },
        })
    );
}

#[test]
fn element_children_collects_multiple_nodes() {
    let node = Element::new("Card")
        .children(vec![text("раз"), text("два")])
        .build();
    assert_eq!(
        node,
        json!({
            "type": "Card",
            "children": [
                { "type": "#text", "value": "раз" },
                { "type": "#text", "value": "два" },
            ],
        })
    );
}

#[test]
fn declaration_omits_absent_metadata() {
    let declaration = Declaration::new(SPACE_SETTINGS_SECTION, "app.general");
    assert_eq!(
        serde_json::to_value(&declaration).expect("сериализация"),
        json!({ "space": "settings.section", "id": "app.general", "nodes": [] })
    );
}

#[test]
fn declaration_keeps_title_and_description() {
    let declaration = Declaration::new(SPACE_SETTINGS_SECTION, "app.general")
        .title("Общие")
        .description("Параметры")
        .node(text("тело"));
    assert_eq!(
        serde_json::to_value(&declaration).expect("сериализация"),
        json!({
            "space": "settings.section",
            "id": "app.general",
            "title": "Общие",
            "description": "Параметры",
            "nodes": [{ "type": "#text", "value": "тело" }],
        })
    );
}

#[test]
fn response_carries_schema_version_and_spaces() {
    let response =
        Declaration::response(&[Declaration::new(SPACE_SETTINGS_SECTION, "app.general")]);
    assert_eq!(
        response,
        json!({
            "version": UI_SCHEMA_VERSION,
            "spaces": [
                { "space": "settings.section", "id": "app.general", "nodes": [] },
            ],
        })
    );
}
