use super::*;

use serde_json::json;

/// Схема с объектом, обязательным полем и вложенным списком.
fn sample_schema() -> serde_json::Value {
    json!({
        "type": "object",
        "required": ["name", "items"],
        "properties": {
            "name": { "type": "string", "minLength": 1 },
            "count": { "type": "integer", "minimum": 0 },
            "items": { "type": "array", "items": { "$ref": "#/$defs/item" } },
        },
        "additionalProperties": false,
        "$defs": {
            "item": {
                "type": "object",
                "required": ["kind"],
                "properties": { "kind": { "enum": ["a", "b"] } },
                "additionalProperties": false,
            },
        },
    })
}

#[test]
fn accepts_valid_document() {
    let value = json!({ "name": "документ", "count": 3, "items": [{ "kind": "a" }] });
    validate(&value, &sample_schema()).expect("документ соответствует схеме");
}

#[test]
fn rejects_missing_required_field() {
    let value = json!({ "name": "документ" });
    let error = validate(&value, &sample_schema()).expect_err("нет обязательного поля");
    assert!(error.contains("items"), "{error}");
}

#[test]
fn rejects_unknown_field() {
    let value = json!({ "name": "документ", "items": [], "лишнее": 1 });
    let error = validate(&value, &sample_schema()).expect_err("неизвестное поле");
    assert!(error.contains("неизвестное поле `лишнее`"), "{error}");
}

#[test]
fn rejects_wrong_type_and_bounds() {
    let value = json!({ "name": "", "items": [] });
    assert!(validate(&value, &sample_schema()).is_err(), "пустая строка");

    let value = json!({ "name": "д", "count": -1, "items": [] });
    assert!(validate(&value, &sample_schema()).is_err(), "минимум");

    let value = json!({ "name": "д", "count": "три", "items": [] });
    let error = validate(&value, &sample_schema()).expect_err("тип числа");
    assert!(error.contains("неверный тип"), "{error}");
}

#[test]
fn rejects_enum_value_inside_list() {
    let value = json!({ "name": "д", "items": [{ "kind": "c" }] });
    let error = validate(&value, &sample_schema()).expect_err("значение вне перечисления");
    assert!(error.contains("недопустимое значение"), "{error}");
    assert!(error.contains("items`[0]"), "путь элемента списка: {error}");
}

#[test]
fn supports_nullable_type_and_const() {
    let schema = json!({
        "type": "object",
        "properties": {
            "marker": { "const": "context.kind" },
            "note": { "type": ["string", "null"] },
        },
        "additionalProperties": false,
    });
    validate(&json!({ "marker": "context.kind", "note": null }), &schema).expect("null допустим");
    let error =
        validate(&json!({ "marker": "other", "note": null }), &schema).expect_err("чужая метка");
    assert!(error.contains("ожидается"), "{error}");
}

#[test]
fn supports_additional_properties_schema() {
    let schema = json!({
        "type": "object",
        "additionalProperties": { "type": "integer" },
    });
    validate(&json!({ "a": 1, "b": 2 }), &schema).expect("значения по схеме");
    assert!(validate(&json!({ "a": "один" }), &schema).is_err());
}

#[test]
fn rejects_broken_schema_reference() {
    let schema = json!({ "$ref": "#/$defs/absent" });
    let error = validate(&json!({}), &schema).expect_err("битая ссылка");
    assert!(error.contains("ссылка схемы не найдена"), "{error}");
}

#[test]
fn reports_reading_error_of_schema_text() {
    let error = validate_text(&json!({}), "не JSON", "workspaces").expect_err("битая схема");
    assert!(error.contains("схема документа workspaces"), "{error}");
}
