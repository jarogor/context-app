use super::*;
use crate::models::{FieldSchema, Schema, SectionSchema, Source};
use serde_json::json;

/// Поле с типом и значением по умолчанию.
fn field(key: &str, title: &str, field_type: &str, default: serde_json::Value) -> FieldSchema {
    FieldSchema {
        key: key.to_string(),
        title: title.to_string(),
        field_type: field_type.to_string(),
        description: None,
        default: Some(default),
        options: Vec::new(),
    }
}

/// Состояние с реестром секции `app.general` и полями настроек.
fn state_with_registry() -> SettingsState {
    let source = Source {
        owner: "app".to_string(),
        kind: "app".to_string(),
        schema: Schema {
            title: Some("Приложение".to_string()),
            sections: vec![SectionSchema {
                id: "general".to_string(),
                title: "Общие".to_string(),
                description: None,
                fields: vec![
                    field(
                        "startup.welcome_notification",
                        "Приветствие",
                        "boolean",
                        json!(true),
                    ),
                    field("startup.title", "Заголовок", "string", json!("Контекст")),
                ],
            }],
        },
    };
    let registry = Registry::from_sources(&[source]).expect("реестр");
    let mut state = SettingsState::new();
    state.set_registry(&registry);
    state
}

#[test]
fn defaults_are_visible_without_saved_values() {
    let state = state_with_registry();
    let values = state.values_for("app.general").expect("значения");
    assert_eq!(values["startup.welcome_notification"], json!(true));
    assert_eq!(values["startup.title"], json!("Контекст"));
}

#[test]
fn set_values_merges_with_defaults() {
    let mut state = state_with_registry();
    let merged = state
        .set_values(
            "app.general",
            &json!({ "startup.welcome_notification": false, "extra": 1 }),
        )
        .expect("сохранение");
    assert_eq!(merged["startup.welcome_notification"], json!(false));
    assert_eq!(merged["extra"], json!(1));
    assert_eq!(merged["startup.title"], json!("Контекст"));

    let values = state.values_for("app.general").expect("значения");
    assert_eq!(values["startup.welcome_notification"], json!(false));
}

#[test]
fn set_values_rejects_unknown_section() {
    let mut state = state_with_registry();
    let result = state.set_values("missing.section", &json!({ "a": 1 }));
    assert!(result.is_err(), "неизвестная секция отклоняется");
}

#[test]
fn set_values_rejects_non_object() {
    let mut state = state_with_registry();
    let result = state.set_values("app.general", &json!("строка"));
    assert!(result.is_err(), "не-объект отклоняется");
}

#[test]
fn sections_with_values_include_field_metadata() {
    let state = state_with_registry();
    let sections = state.sections_with_values();
    assert_eq!(sections.len(), 1);
    assert_eq!(sections[0]["id"], "app.general");
    assert_eq!(sections[0]["owner"], "app");
    assert_eq!(sections[0]["title"], "Общие");
    assert_eq!(
        sections[0]["fields"][0]["key"],
        "startup.welcome_notification"
    );
    assert_eq!(sections[0]["fields"][0]["title"], "Приветствие");
    assert_eq!(sections[0]["fields"][0]["type"], "boolean");
    assert_eq!(
        sections[0]["values"]["startup.welcome_notification"],
        json!(true)
    );
}
