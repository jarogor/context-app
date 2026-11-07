use super::*;

use std::path::PathBuf;

use serde::Deserialize;
use serde_json::json;

use crate::documents::{DocumentVersion, Owner};

/// Простое состояние для проверки записи и чтения.
#[derive(Debug, Default, PartialEq, serde::Serialize, Deserialize)]
struct Sample {
    /// Поле состояния.
    #[serde(default)]
    value: String,
}

/// Документ для тестов записи.
static SAMPLE: DocumentKind = DocumentKind {
    format: "context.sample",
    schema_name: "sample",
    owner: Owner::Core,
    versions: &[DocumentVersion::only(
        1,
        r#"{
            "type": "object",
            "required": ["value"],
            "properties": {
                "format": { "const": "context.sample" },
                "version": { "type": "integer", "minimum": 1 },
                "value": { "type": "string" }
            },
            "additionalProperties": false
        }"#,
    )],
};

/// Временный каталог теста.
fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("context-documents-{name}"));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("каталог");
    dir
}

#[test]
fn write_adds_marker_and_version() {
    let dir = temp_dir("write");
    let path = dir.join("sample.json");

    write(
        &path,
        &SAMPLE,
        &Sample {
            value: "да".to_string(),
        },
    )
    .expect("запись");

    let text = std::fs::read_to_string(&path).expect("файл");
    let value: serde_json::Value = serde_json::from_str(&text).expect("JSON");
    assert_eq!(value["format"], "context.sample");
    assert_eq!(value["version"], 1);
    assert_eq!(value["value"], "да");
}

#[test]
fn read_returns_model_and_skips_absent_file() {
    let dir = temp_dir("read");
    let path = dir.join("sample.json");
    assert_eq!(read::<Sample>(&path, &SAMPLE).expect("нет файла"), None);

    write(
        &path,
        &SAMPLE,
        &Sample {
            value: "да".to_string(),
        },
    )
    .expect("запись");
    let sample: Sample = read(&path, &SAMPLE).expect("чтение").expect("документ");
    assert_eq!(sample.value, "да");
}

#[test]
fn read_accepts_document_without_marker() {
    let dir = temp_dir("legacy");
    let path = dir.join("sample.json");
    std::fs::write(&path, r#"{ "value": "старый" }"#).expect("файл");

    let sample: Sample = read(&path, &SAMPLE).expect("чтение").expect("документ");
    assert_eq!(sample.value, "старый");
}

#[test]
fn read_rejects_foreign_marker() {
    let dir = temp_dir("foreign");
    let path = dir.join("sample.json");
    std::fs::write(
        &path,
        r#"{ "format": "context.other", "version": 1, "value": "чужой" }"#,
    )
    .expect("файл");

    let error = read::<Sample>(&path, &SAMPLE).expect_err("чужая метка");
    assert!(error.contains("файл другого вида"), "{error}");
}

#[test]
fn read_rejects_newer_version() {
    let dir = temp_dir("newer");
    let path = dir.join("sample.json");
    std::fs::write(
        &path,
        r#"{ "format": "context.sample", "version": 2, "value": "новый" }"#,
    )
    .expect("файл");

    let error = read::<Sample>(&path, &SAMPLE).expect_err("новая версия");
    assert!(error.contains("более новой версией"), "{error}");
}

#[test]
fn read_rejects_document_against_schema() {
    let dir = temp_dir("invalid");
    let path = dir.join("sample.json");
    std::fs::write(
        &path,
        r#"{ "format": "context.sample", "version": 1, "value": 5 }"#,
    )
    .expect("файл");

    let error = read::<Sample>(&path, &SAMPLE).expect_err("тип поля");
    assert!(error.contains("неверный тип"), "{error}");
}

#[test]
fn write_rejects_document_against_schema() {
    let dir = temp_dir("write-invalid");
    let path = dir.join("sample.json");
    // Сериализуем значение, которое схема не принимает: лишнее поле.
    let error = write(&path, &SAMPLE, &json!({ "value": "да", "лишнее": 1 }))
        .expect_err("неизвестное поле");
    assert!(error.contains("неизвестное поле"), "{error}");
    assert!(!path.exists(), "битый документ не записан");
}

/// Приведение первой версии тестового документа ко второй: `title` → `name`.
fn rename_title(value: &mut Value) -> Result<(), String> {
    let object = value
        .as_object_mut()
        .ok_or("документ должен быть объектом")?;
    let title = object
        .remove("title")
        .ok_or_else(|| "в документе первой версии нет поля `title`".to_string())?;
    object.insert("name".to_string(), title);
    Ok(())
}

/// Тестовый документ с двумя версиями формата.
static VERSIONED: DocumentKind = DocumentKind {
    format: "context.versioned",
    schema_name: "versioned",
    owner: Owner::Core,
    versions: &[
        DocumentVersion {
            version: 1,
            schema: r#"{
                "type": "object",
                "required": ["title"],
                "properties": {
                    "format": { "const": "context.versioned" },
                    "version": { "type": "integer", "minimum": 1 },
                    "title": { "type": "string", "minLength": 1 }
                },
                "additionalProperties": false
            }"#,
            upgrade: Some(rename_title),
        },
        DocumentVersion::only(
            2,
            r#"{
                "type": "object",
                "required": ["name"],
                "properties": {
                    "format": { "const": "context.versioned" },
                    "version": { "type": "integer", "minimum": 2 },
                    "name": { "type": "string", "minLength": 1 }
                },
                "additionalProperties": false
            }"#,
        ),
    ],
};

/// Модель второй версии тестового документа.
#[derive(Debug, Default, PartialEq, serde::Serialize, Deserialize)]
struct Versioned {
    /// Новое имя поля после приведения.
    #[serde(default)]
    name: String,
}

#[test]
fn write_uses_current_version() {
    let dir = temp_dir("versioned-write");
    let path = dir.join("versioned.json");

    write(
        &path,
        &VERSIONED,
        &Versioned {
            name: "итог".to_string(),
        },
    )
    .expect("запись");

    let document: Value =
        serde_json::from_str(&std::fs::read_to_string(&path).expect("файл")).expect("JSON");
    assert_eq!(document["version"], 2, "пишется текущая версия");
    assert_eq!(document["name"], "итог");
}

#[test]
fn old_version_is_upgraded_on_read() {
    let dir = temp_dir("versioned-upgrade");
    let path = dir.join("versioned.json");
    // Документ первой версии: прежнее поле `title`, метка и версия на месте.
    std::fs::write(
        &path,
        r#"{ "format": "context.versioned", "version": 1, "title": "старое" }"#,
    )
    .expect("файл");

    let document: Versioned = read(&path, &VERSIONED).expect("чтение").expect("документ");
    assert_eq!(document.name, "старое", "поле приведено к новой версии");
}

#[test]
fn document_without_version_is_read_as_first_version() {
    let dir = temp_dir("versioned-legacy");
    let path = dir.join("versioned.json");
    std::fs::write(&path, r#"{ "title": "прежнее" }"#).expect("файл");

    let document: Versioned = read(&path, &VERSIONED).expect("чтение").expect("документ");
    assert_eq!(document.name, "прежнее");
}

#[test]
fn old_version_is_validated_by_its_own_schema() {
    let dir = temp_dir("versioned-old-invalid");
    let path = dir.join("versioned.json");
    // Поле новой версии в документе первой версии: своя схема его не принимает.
    std::fs::write(
        &path,
        r#"{ "format": "context.versioned", "version": 1, "name": "новое" }"#,
    )
    .expect("файл");

    let error = read::<Versioned>(&path, &VERSIONED).expect_err("схема первой версии");
    assert!(error.contains("отсутствует поле `title`"), "{error}");
}

#[test]
fn failed_upgrade_is_reported() {
    let dir = temp_dir("versioned-broken");
    let path = dir.join("versioned.json");
    // Схема первой версии проходит, а приведению нечего переименовывать.
    std::fs::write(&path, r#"{ "title": "" }"#).expect("файл");

    let error = read::<Versioned>(&path, &VERSIONED).expect_err("отказ приведения");
    assert!(
        error.contains("title") || error.contains("слишком короткое"),
        "{error}"
    );
}
