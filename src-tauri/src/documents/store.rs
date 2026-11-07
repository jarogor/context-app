//! Чтение и запись служебных документов: метка, версии, приведение и схема.
//!
//! Маркер и версия — часть конверта документа, а не модели: запись добавляет их
//! в сериализованное значение, чтение проверяет и отбрасывает.
//!
//! **Версии.** Документ проверяется схемой **своей** версии, затем проводится по
//! цепочке приведений `upgrade` до текущей и проверяется её схемой. Поэтому
//! вчерашний файл читается сегодняшним приложением: старые схемы остаются в
//! реестре, пока читаются старые документы.

use std::io;
use std::path::Path;

use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::Value;

use crate::atomic_file;
use crate::documents::schema;
use crate::documents::DocumentKind;

/// Поле версии формата в документе.
const VERSION_FIELD: &str = "version";

/// Чтение документа: `None` — файла нет.
///
/// Порядок: разбор значения, проверка метки, приведение версии к текущей
/// (с проверкой схемы каждой ступени) и разбор модели. Файл без метки и версии
/// считается документом первой версии: так читаются данные, сохранённые до
/// введения маркеров.
pub fn read<T: DeserializeOwned>(path: &Path, kind: &DocumentKind) -> Result<Option<T>, String> {
    let text = match std::fs::read_to_string(path) {
        Ok(text) => text,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(format!(
                "документ не читается ({}): {error}",
                kind.schema_name
            ));
        }
    };
    let value: Value = serde_json::from_str(&text)
        .map_err(|error| format!("документ не разбирается ({}): {error}", kind.schema_name))?;
    let value = upgrade_to_current(value, kind)?;
    serde_json::from_value(value).map(Some).map_err(|error| {
        format!(
            "документ не соответствует модели ({}): {error}",
            kind.schema_name
        )
    })
}

/// Чтение документа; отсутствие файла даёт значение по умолчанию.
pub fn read_or_default<T: DeserializeOwned + Default>(
    path: &Path,
    kind: &DocumentKind,
) -> Result<T, String> {
    Ok(read::<T>(path, kind)?.unwrap_or_default())
}

/// Запись документа с меткой формата и текущей версией.
///
/// Документ проверяется схемой текущей версии перед записью: битые данные не
/// попадают на диск.
pub fn write<T: Serialize>(path: &Path, kind: &DocumentKind, value: &T) -> Result<(), String> {
    let mut document = serde_json::to_value(value)
        .map_err(|error| format!("документ не сериализуется ({}): {error}", kind.schema_name))?;
    let object = document
        .as_object_mut()
        .ok_or_else(|| format!("документ {} должен быть объектом JSON", kind.schema_name))?;
    if let Some(marker) = kind.marker() {
        object.insert("format".to_string(), Value::String(marker.to_string()));
    }
    object.insert(
        VERSION_FIELD.to_string(),
        Value::from(kind.current_version()),
    );
    schema::validate_text(&document, kind.current_schema(), kind.schema_name)?;
    atomic_file::write_json(path, &document).map_err(|error| error.to_string())
}

/// Проверка метки и приведение документа к текущей версии.
fn upgrade_to_current(mut value: Value, kind: &DocumentKind) -> Result<Value, String> {
    check_marker(&value, kind)?;

    let found = value
        .get(VERSION_FIELD)
        .and_then(Value::as_u64)
        .map(|version| version as u32)
        .unwrap_or(0);
    let current = kind.current_version();
    if found > current {
        return Err(format!(
            "документ {} создан более новой версией приложения ({found} > {current})",
            kind.schema_name
        ));
    }
    // Документ без версии — первая версия формата.
    let mut position = if found == 0 {
        0
    } else {
        kind.position(found)
            .ok_or_else(|| format!("неизвестная версия документа {}: {found}", kind.schema_name))?
    };

    loop {
        let version = &kind.versions[position];
        schema::validate_text(&value, version.schema, kind.schema_name)?;
        let Some(upgrade) = version.upgrade else {
            break;
        };
        upgrade(&mut value)?;
        // Документ стал следующей версией: номер фиксируется до проверки её схемы,
        // иначе схема новой версии увидит старое значение поля `version`.
        let next = kind.versions[position + 1].version;
        if let Some(object) = value.as_object_mut() {
            object.insert(VERSION_FIELD.to_string(), Value::from(next));
        }
        position += 1;
    }

    if let Some(object) = value.as_object_mut() {
        object.insert(VERSION_FIELD.to_string(), Value::from(current));
    }
    Ok(value)
}

/// Проверка метки формата: чужой JSON не принимается за наш документ.
fn check_marker(value: &Value, kind: &DocumentKind) -> Result<(), String> {
    let Some(marker) = kind.marker() else {
        return Ok(());
    };
    let object = value
        .as_object()
        .ok_or_else(|| format!("документ {} должен быть объектом JSON", kind.schema_name))?;
    if let Some(found) = object.get("format").and_then(Value::as_str) {
        if found != marker {
            return Err(format!(
                "файл другого вида: метка `{found}`, ожидается `{marker}`"
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
#[path = "store_tests.rs"]
mod tests;
