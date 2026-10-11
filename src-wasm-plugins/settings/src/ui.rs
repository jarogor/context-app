//! Построение декларативного интерфейса секций настроек.
//!
//! Плагин настроек описывает интерфейс дерева `ui-schema`, а хост рисует его
//! компонентами единой дизайн-системы. Поля секций — доменная модель плагина;
//! в декларацию они превращаются типизированными конструкторами SDK, поэтому
//! хост не знает о типах полей.

use serde_json::Value;
use ui_sdk::{Declaration, Element, SPACE_SETTINGS_SECTION};

use crate::models::{FieldSchema, RegisteredSection};

/// Идентификатор действия сохранения значений секции.
pub const ACTION_SAVE: &str = "save";

/// Построение декларации пространства `settings.section` для одной секции.
pub fn section_declaration(section: &RegisteredSection, values: &Value) -> Declaration {
    let mut declaration =
        Declaration::new(SPACE_SETTINGS_SECTION, &section.id).title(&section.title);
    if let Some(description) = section.description.as_deref() {
        declaration = declaration.description(description);
    }
    declaration = declaration.node(
        Element::new("Heading")
            .prop("text", section.title.clone())
            .prop("level", 2)
            .build(),
    );
    if let Some(description) = section.description.as_deref() {
        declaration = declaration.node(Element::new("Text").prop("text", description).build());
    }
    for field in &section.fields {
        declaration = declaration.node(field_node(field, values.get(&field.key)));
        if let Some(description) = field.description.as_deref() {
            declaration = declaration.node(Element::new("Text").prop("text", description).build());
        }
    }
    declaration.node(
        Element::new("Button")
            .prop("label", "Сохранить")
            .prop("variant", "secondary")
            .action("click", ACTION_SAVE)
            .build(),
    )
}

/// Построение узла управления для одного поля.
fn field_node(field: &FieldSchema, value: Option<&Value>) -> Value {
    match field.field_type.as_str() {
        "boolean" => Element::new("Checkbox")
            .prop("name", field.key.clone())
            .prop("label", field.title.clone())
            .prop("checked", value.and_then(Value::as_bool).unwrap_or(false))
            .action("change", ACTION_SAVE)
            .build(),
        "select" => Element::new("Select")
            .prop("name", field.key.clone())
            .prop("label", field.title.clone())
            .prop("value", value.map(display_value).unwrap_or_default())
            .prop("options", options_value(field))
            .action("change", ACTION_SAVE)
            .build(),
        "number" => Element::new("Input")
            .prop("name", field.key.clone())
            .prop("label", field.title.clone())
            .prop("type", "number")
            .prop("value", value.map(number_display).unwrap_or_default())
            .build(),
        "json" => Element::new("Textarea")
            .prop("name", field.key.clone())
            .prop("label", field.title.clone())
            .prop(
                "value",
                value.map(pretty_json).unwrap_or_else(|| "null".to_string()),
            )
            .build(),
        _ => Element::new("Input")
            .prop("name", field.key.clone())
            .prop("label", field.title.clone())
            .prop("value", value.map(display_value).unwrap_or_default())
            .build(),
    }
}

/// Варианты выбора поля `select` в виде, понятном рендереру.
fn options_value(field: &FieldSchema) -> Value {
    Value::Array(
        field
            .options
            .iter()
            .map(|option| {
                serde_json::json!({
                    "value": display_value(&option.value),
                    "title": option.title,
                })
            })
            .collect(),
    )
}

/// Строковое представление значения для контролов.
fn display_value(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

/// Строковое представление числового значения без лишней дробной части.
///
/// Целое число показывается как `50`, а не `50.0`: числовое поле в интерфейсе
/// не должно получать хвост `.0`, даже если значение сохранилось дробью.
fn number_display(value: &Value) -> String {
    match value {
        Value::Number(number) => format_number(number),
        other => display_value(other),
    }
}

/// Форматирование числа без хвоста `.0` для целых значений.
fn format_number(number: &serde_json::Number) -> String {
    if let Some(integer) = number.as_i64() {
        return integer.to_string();
    }
    if let Some(unsigned) = number.as_u64() {
        return unsigned.to_string();
    }
    match number.as_f64() {
        Some(float) if float.is_finite() && float.fract() == 0.0 && float.abs() < 9e15 => {
            format!("{}", float as i64)
        }
        _ => number.to_string(),
    }
}

/// Форматированный JSON для текстового поля.
fn pretty_json(value: &Value) -> String {
    serde_json::to_string_pretty(value).unwrap_or_else(|_| "null".to_string())
}

#[cfg(test)]
#[path = "ui_tests.rs"]
mod tests;
