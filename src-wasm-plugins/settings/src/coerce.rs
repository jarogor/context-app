//! Приведение значений контролов к типам полей секции настроек.
//!
//! Значения приходят из интерфейса как строки; здесь они приводятся к типу
//! поля (`boolean`, `number`, `json`). Неизвестные поля секции остаются как
//! есть, некорректное значение даёт ошибку с названием поля.

use serde_json::json;

use crate::models::FieldSchema;

/// Приведение значений контролов к типам полей секции.
///
/// Возвращает ошибку с человекочитаемым названием поля, если значение не
/// соответствует типу; в этом случае интент не сохраняется.
pub fn coerce_values(
    fields: &[FieldSchema],
    values: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let incoming = values
        .as_object()
        .ok_or_else(|| "значения секции должны быть объектом".to_string())?;
    let mut result = serde_json::Map::new();
    for (key, value) in incoming {
        let field = fields.iter().find(|field| &field.key == key);
        let coerced = match field {
            Some(field) => coerce_value(field, value)?,
            None => value.clone(),
        };
        result.insert(key.clone(), coerced);
    }
    Ok(serde_json::Value::Object(result))
}

/// Приведение одного значения к типу поля.
fn coerce_value(
    field: &FieldSchema,
    value: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let invalid = || format!("Некорректное значение поля «{}»", field.title);
    match field.field_type.as_str() {
        "boolean" => Ok(serde_json::Value::Bool(match value {
            serde_json::Value::Bool(flag) => *flag,
            serde_json::Value::String(text) => text == "true",
            _ => false,
        })),
        "number" => match value {
            serde_json::Value::Number(_) => Ok(value.clone()),
            serde_json::Value::String(text) => text
                .parse::<f64>()
                .map(|number| json!(number))
                .map_err(|_| invalid()),
            _ => Err(invalid()),
        },
        "json" => match value {
            serde_json::Value::String(text) => serde_json::from_str(text).map_err(|_| invalid()),
            other => Ok(other.clone()),
        },
        _ => Ok(value.clone()),
    }
}
