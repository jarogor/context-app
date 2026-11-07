//! Проверка JSON-значения по схеме документа.
//!
//! Схемы документов — наши собственные файлы из каталога `schemas/`, поэтому
//! поддерживается ровно то подмножество JSON Schema, которое в них используется:
//! `type`, `const`, `enum`, `properties`, `required`, `additionalProperties`,
//! `items`, `minimum`, `maximum`, `minLength` и локальные ссылки `#/$defs/...`.
//! Полноценный валидатор со всеми ключевыми словами здесь не нужен: схемы
//! пишем мы, и лишние возможности только скрыли бы расхождение с кодом.

use serde_json::Value;

/// Проверка значения по тексту схемы.
pub fn validate_text(value: &Value, schema_text: &str, what: &str) -> Result<(), String> {
    let schema: Value = serde_json::from_str(schema_text)
        .map_err(|error| format!("схема документа {what} не читается: {error}"))?;
    validate(value, &schema).map_err(|error| format!("{what}: {error}"))
}

/// Проверка значения по разобранной схеме.
pub fn validate(value: &Value, schema: &Value) -> Result<(), String> {
    check(value, schema, schema, "")
}

/// Проверка одного узла по схеме; `root` — корень для ссылок, `path` — путь поля.
fn check(value: &Value, schema: &Value, root: &Value, path: &str) -> Result<(), String> {
    let schema = resolve(schema, root)?;
    let field = if path.is_empty() {
        "документ"
    } else {
        path
    };

    if let Some(expected) = schema.get("const") {
        if value != expected {
            return Err(format!("{field}: ожидается {expected}, получено {value}"));
        }
    }

    if let Some(options) = schema.get("enum").and_then(Value::as_array) {
        if !options.iter().any(|option| option == value) {
            let allowed: Vec<String> = options.iter().map(|option| option.to_string()).collect();
            return Err(format!(
                "{field}: недопустимое значение {value}, допустимо: {}",
                allowed.join(", ")
            ));
        }
    }

    if let Some(types) = schema.get("type") {
        let allowed: Vec<&str> = match types {
            Value::String(name) => vec![name.as_str()],
            Value::Array(names) => names.iter().filter_map(Value::as_str).collect(),
            _ => return Err(format!("{field}: некорректное описание типа в схеме")),
        };
        if !allowed.iter().any(|name| has_type(value, name)) {
            return Err(format!(
                "{field}: неверный тип значения, ожидается {}",
                allowed.join(" или ")
            ));
        }
    }

    check_bounds(value, schema, field)?;
    check_object(value, schema, root, path, field)?;
    check_array(value, schema, root, path)?;
    Ok(())
}

/// Проверка числовых и строковых границ значения.
fn check_bounds(value: &Value, schema: &Value, field: &str) -> Result<(), String> {
    if let Some(minimum) = schema.get("minimum").and_then(Value::as_f64) {
        if let Some(number) = value.as_f64() {
            if number < minimum {
                return Err(format!("{field}: значение меньше допустимого {minimum}"));
            }
        }
    }
    if let Some(maximum) = schema.get("maximum").and_then(Value::as_f64) {
        if let Some(number) = value.as_f64() {
            if number > maximum {
                return Err(format!("{field}: значение больше допустимого {maximum}"));
            }
        }
    }
    if let Some(text) = value.as_str() {
        if let Some(min_length) = schema.get("minLength").and_then(Value::as_u64) {
            if (text.chars().count() as u64) < min_length {
                return Err(format!(
                    "{field}: слишком короткое значение, минимум {min_length} символов"
                ));
            }
        }
        if let Some(max_length) = schema.get("maxLength").and_then(Value::as_u64) {
            if (text.chars().count() as u64) > max_length {
                return Err(format!(
                    "{field}: слишком длинное значение, максимум {max_length} символов"
                ));
            }
        }
    }
    Ok(())
}

/// Проверка объекта: обязательные, известные и дополнительные поля.
fn check_object(
    value: &Value,
    schema: &Value,
    root: &Value,
    path: &str,
    field: &str,
) -> Result<(), String> {
    let Some(object) = value.as_object() else {
        return Ok(());
    };
    if let Some(required) = schema.get("required").and_then(Value::as_array) {
        for name in required.iter().filter_map(Value::as_str) {
            if !object.contains_key(name) {
                return Err(format!("{field}: отсутствует поле `{name}`"));
            }
        }
    }
    let properties = schema.get("properties").and_then(Value::as_object);
    let additional = schema.get("additionalProperties");
    for (name, item) in object {
        let child = child_path(path, name);
        if let Some(child_schema) = properties.and_then(|map| map.get(name)) {
            check(item, child_schema, root, &child)?;
            continue;
        }
        match additional {
            Some(Value::Bool(false)) => {
                return Err(format!("{field}: неизвестное поле `{name}`"));
            }
            Some(Value::Bool(true)) | None => {}
            Some(child_schema) => check(item, child_schema, root, &child)?,
        }
    }
    Ok(())
}

/// Проверка элементов массива по схеме `items`.
fn check_array(value: &Value, schema: &Value, root: &Value, path: &str) -> Result<(), String> {
    let (Some(items), Some(array)) = (schema.get("items"), value.as_array()) else {
        return Ok(());
    };
    for (index, item) in array.iter().enumerate() {
        let child = format!(
            "{}[{index}]",
            if path.is_empty() {
                "элемент"
            } else {
                path
            }
        );
        check(item, items, root, &child)?;
    }
    Ok(())
}

/// Разворачивание локальной ссылки `#/$defs/<имя>` по корню схемы.
fn resolve<'a>(schema: &'a Value, root: &'a Value) -> Result<&'a Value, String> {
    let Some(reference) = schema.get("$ref").and_then(Value::as_str) else {
        return Ok(schema);
    };
    let target = reference
        .strip_prefix("#/")
        .ok_or_else(|| format!("внешняя ссылка схемы не поддерживается: {reference}"))?;
    let mut current = root;
    for segment in target.split('/') {
        let segment = segment.replace("~1", "/").replace("~0", "~");
        current = current
            .get(&segment)
            .ok_or_else(|| format!("ссылка схемы не найдена: {reference}"))?;
    }
    Ok(current)
}

/// Путь поля для сообщения об ошибке.
fn child_path(path: &str, name: &str) -> String {
    if path.is_empty() {
        format!("поле `{name}`")
    } else {
        format!("{path}.{name}")
    }
}

/// Соответствует ли значение имени типа JSON.
fn has_type(value: &Value, name: &str) -> bool {
    match name {
        "object" => value.is_object(),
        "array" => value.is_array(),
        "string" => value.is_string(),
        "integer" => value.as_i64().is_some() || value.as_u64().is_some(),
        "number" => value.is_number(),
        "boolean" => value.is_boolean(),
        "null" => value.is_null(),
        _ => false,
    }
}

#[cfg(test)]
#[path = "schema_tests.rs"]
mod tests;
