use super::*;

use serde_json::json;

use crate::models::FieldSchema;

/// Поле секции заданного типа.
fn field(key: &str, field_type: &str) -> FieldSchema {
    FieldSchema {
        key: key.to_string(),
        title: "Значение".to_string(),
        field_type: field_type.to_string(),
        description: None,
        default: None,
        options: Vec::new(),
    }
}

#[test]
fn integer_text_is_stored_as_integer() {
    let fields = [field("limit", "number")];
    let coerced = coerce_values(&fields, &json!({ "limit": "50" })).expect("приведение");
    assert_eq!(
        coerced["limit"],
        json!(50),
        "целое значение сохраняется целым, а не 50.0"
    );
    assert!(coerced["limit"].is_i64(), "значение остаётся целым числом");
}

#[test]
fn fractional_text_is_stored_as_fraction() {
    let fields = [field("ratio", "number")];
    let coerced = coerce_values(&fields, &json!({ "ratio": "1.5" })).expect("приведение");
    assert_eq!(coerced["ratio"], json!(1.5));
}

#[test]
fn invalid_number_text_is_rejected() {
    let fields = [field("limit", "number")];
    let result = coerce_values(&fields, &json!({ "limit": "не число" }));
    assert!(result.is_err(), "нечисловая строка отклоняется");
}
