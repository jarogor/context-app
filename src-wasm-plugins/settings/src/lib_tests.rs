use super::*;
use std::cell::RefCell;

/// Фейковые host-функции для нативных тестов.
#[derive(Default)]
struct FakeHost {
    /// Служебное состояние плагина.
    state: RefCell<Option<String>>,
    /// Опубликованные события.
    events: RefCell<Vec<(String, String)>>,
}

impl Host for FakeHost {
    fn state_read(&self, _key: &str) -> Result<Option<String>, String> {
        Ok(self.state.borrow().clone())
    }

    fn state_write(&self, _key: &str, value: &str) -> Result<(), String> {
        *self.state.borrow_mut() = Some(value.to_string());
        Ok(())
    }

    fn emit_event(&self, name: &str, payload: &str) -> Result<(), String> {
        self.events
            .borrow_mut()
            .push((name.to_string(), payload.to_string()));
        Ok(())
    }
}

/// Запрос по контракту.
fn request(action: &str, payload: serde_json::Value) -> String {
    serde_json::json!({ "action": action, "payload": payload }).to_string()
}

/// Декларация секции `app.general` с одним полем-флажком.
fn app_source() -> serde_json::Value {
    serde_json::json!({
        "owner": "app",
        "kind": "app",
        "schema": {
            "title": "Приложение",
            "sections": [
                {
                    "id": "general",
                    "title": "Общие",
                    "fields": [
                        {
                            "key": "startup.welcome_notification",
                            "title": "Приветствие при запуске",
                            "type": "boolean",
                            "default": true
                        }
                    ]
                }
            ]
        }
    })
}

#[test]
fn register_then_list_returns_sections() {
    let host = FakeHost::default();
    let output = handle(
        &host,
        &request("register", serde_json::json!({ "sources": [app_source()] })),
    )
    .expect("регистрация");
    let parsed: serde_json::Value = serde_json::from_str(&output).expect("JSON");
    assert_eq!(parsed["sections"][0]["id"], "app.general");
    assert_eq!(
        parsed["sections"][0]["fields"][0]["key"],
        "startup.welcome_notification"
    );
    assert_eq!(
        parsed["sections"][0]["fields"][0]["title"],
        "Приветствие при запуске"
    );
    assert_eq!(
        parsed["sections"][0]["values"]["startup.welcome_notification"],
        serde_json::json!(true)
    );

    let listed = handle(&host, &request("list", serde_json::json!({}))).expect("список");
    let parsed: serde_json::Value = serde_json::from_str(&listed).expect("JSON");
    assert_eq!(parsed["sections"].as_array().expect("массив").len(), 1);
}

#[test]
fn get_returns_defaults() {
    let host = FakeHost::default();
    let _ = handle(
        &host,
        &request("register", serde_json::json!({ "sources": [app_source()] })),
    )
    .expect("регистрация");
    let output = handle(
        &host,
        &request("get", serde_json::json!({ "section": "app.general" })),
    )
    .expect("получение");
    let parsed: serde_json::Value = serde_json::from_str(&output).expect("JSON");
    assert_eq!(parsed["values"]["startup.welcome_notification"], true);
}

#[test]
fn set_merges_values_and_emits_event() {
    let host = FakeHost::default();
    let _ = handle(
        &host,
        &request("register", serde_json::json!({ "sources": [app_source()] })),
    )
    .expect("регистрация");
    let output = handle(
        &host,
        &request(
            "set",
            serde_json::json!({
                "section": "app.general",
                "values": { "startup.welcome_notification": false }
            }),
        ),
    )
    .expect("сохранение");
    let parsed: serde_json::Value = serde_json::from_str(&output).expect("JSON");
    assert_eq!(parsed["values"]["startup.welcome_notification"], false);

    let events = host.events.borrow();
    assert_eq!(events.len(), 1, "событие опубликовано");
    assert_eq!(events[0].0, "settings:changed");
    let event: serde_json::Value = serde_json::from_str(&events[0].1).expect("JSON события");
    assert_eq!(event["section"], "app.general");
    assert_eq!(event["values"]["startup.welcome_notification"], false);
}

#[test]
fn duplicate_registration_keeps_previous_registry() {
    let host = FakeHost::default();
    let _ = handle(
        &host,
        &request("register", serde_json::json!({ "sources": [app_source()] })),
    )
    .expect("первая регистрация");

    let duplicate = handle(
        &host,
        &request(
            "register",
            serde_json::json!({ "sources": [app_source(), app_source()] }),
        ),
    );
    assert!(duplicate.is_err(), "дубликат отклоняется");

    let listed = handle(&host, &request("list", serde_json::json!({}))).expect("список");
    let parsed: serde_json::Value = serde_json::from_str(&listed).expect("JSON");
    assert_eq!(
        parsed["sections"].as_array().expect("массив").len(),
        1,
        "прежний реестр сохранён"
    );
}

#[test]
fn state_is_json_serializable() {
    let host = FakeHost::default();
    let _ = handle(
        &host,
        &request("register", serde_json::json!({ "sources": [app_source()] })),
    )
    .expect("регистрация");
    let state = host.state.borrow().clone().expect("состояние записано");
    let document: serde_json::Value = serde_json::from_str(&state).expect("состояние — JSON");
    // Метка и версия состояния: по ним файл опознаётся при чтении.
    assert_eq!(document["format"], "context.settings-state");
    assert_eq!(document["version"], 1);
    let parsed: SettingsState = serde_json::from_str(&state).expect("состояние парсится");
    assert_eq!(parsed.registry().len(), 1);
}

#[test]
fn save_sections_writes_all_and_emits_events() {
    let host = FakeHost::default();
    let _ = handle(
        &host,
        &request("register", serde_json::json!({ "sources": [app_source()] })),
    )
    .expect("регистрация");
    let output = handle(
        &host,
        &request(
            "save",
            serde_json::json!({
                "sections": [
                    {
                        "section": "app.general",
                        "values": { "startup.welcome_notification": false }
                    }
                ]
            }),
        ),
    )
    .expect("сохранение набора секций");
    let parsed: serde_json::Value = serde_json::from_str(&output).expect("JSON");
    assert_eq!(parsed["spaces"][0]["id"], "app.general");

    let events = host.events.borrow();
    assert_eq!(events.len(), 1, "событие по сохранённой секции");
    assert_eq!(events[0].0, "settings:changed");
    let event: serde_json::Value = serde_json::from_str(&events[0].1).expect("JSON события");
    assert_eq!(event["section"], "app.general");
    assert_eq!(event["values"]["startup.welcome_notification"], false);
}

#[test]
fn save_sections_with_invalid_value_writes_nothing() {
    let host = FakeHost::default();
    let source = serde_json::json!({
        "owner": "app",
        "kind": "app",
        "schema": {
            "sections": [
                {
                    "id": "general",
                    "title": "Общие",
                    "fields": [
                        { "key": "flag", "title": "Флаг", "type": "boolean", "default": true }
                    ]
                },
                {
                    "id": "data",
                    "title": "Данные",
                    "fields": [
                        { "key": "extra", "title": "Данные", "type": "json" }
                    ]
                }
            ]
        }
    });
    let _ = handle(
        &host,
        &request("register", serde_json::json!({ "sources": [source] })),
    )
    .expect("регистрация");

    // Вторая секция содержит некорректный JSON: не сохраняется ничто.
    let result = handle(
        &host,
        &request(
            "save",
            serde_json::json!({
                "sections": [
                    { "section": "app.general", "values": { "flag": false } },
                    { "section": "app.data", "values": { "extra": "не json" } }
                ]
            }),
        ),
    );
    assert!(result.is_err(), "ошибка неделимого сохранения");
    assert!(host.events.borrow().is_empty(), "событий нет");
    // Валидная секция тоже не изменилась.
    let listed = handle(&host, &request("list", serde_json::json!({}))).expect("список");
    let parsed: serde_json::Value = serde_json::from_str(&listed).expect("JSON");
    let general = parsed["sections"]
        .as_array()
        .expect("секции")
        .iter()
        .find(|section| section["id"] == "app.general")
        .expect("секция general");
    assert_eq!(general["values"]["flag"], true, "значение не изменено");
}

#[test]
fn unknown_action_is_rejected() {
    let host = FakeHost::default();
    let result = handle(&host, &request("unknown", serde_json::json!({})));
    assert!(result.is_err());
}

#[test]
fn ui_returns_declarations_for_registered_sections() {
    let host = FakeHost::default();
    let _ = handle(
        &host,
        &request("register", serde_json::json!({ "sources": [app_source()] })),
    )
    .expect("регистрация");
    let output = handle(&host, &request("ui", serde_json::json!({}))).expect("декларации");
    let parsed: serde_json::Value = serde_json::from_str(&output).expect("JSON");
    assert_eq!(parsed["version"], ui_sdk::UI_SCHEMA_VERSION);
    assert_eq!(parsed["spaces"][0]["space"], ui_sdk::SPACE_SETTINGS_SECTION);
    assert_eq!(parsed["spaces"][0]["id"], "app.general");
    let checkbox = parsed["spaces"][0]["nodes"]
        .as_array()
        .expect("узлы")
        .iter()
        .find(|node| node["type"] == "Checkbox")
        .expect("флажок");
    assert_eq!(checkbox["props"]["checked"], true);
}

#[test]
fn intent_saves_values_and_returns_declarations() {
    let host = FakeHost::default();
    let _ = handle(
        &host,
        &request("register", serde_json::json!({ "sources": [app_source()] })),
    )
    .expect("регистрация");
    let output = handle(
        &host,
        &request(
            "intent",
            serde_json::json!({
                "space": ui_sdk::SPACE_SETTINGS_SECTION,
                "id": "app.general",
                "action": ui::ACTION_SAVE,
                "values": { "startup.welcome_notification": false }
            }),
        ),
    )
    .expect("интент");
    let parsed: serde_json::Value = serde_json::from_str(&output).expect("JSON");
    assert_eq!(parsed["spaces"][0]["space"], ui_sdk::SPACE_SETTINGS_SECTION);
    let checkbox = parsed["spaces"][0]["nodes"]
        .as_array()
        .expect("узлы")
        .iter()
        .find(|node| node["type"] == "Checkbox")
        .expect("флажок");
    assert_eq!(checkbox["props"]["checked"], false);

    let events = host.events.borrow();
    assert_eq!(events.len(), 1, "событие опубликовано");
    assert_eq!(events[0].0, "settings:changed");
}

#[test]
fn intent_with_invalid_json_reports_error_without_saving() {
    let host = FakeHost::default();
    let source = serde_json::json!({
        "owner": "app",
        "kind": "app",
        "schema": {
            "sections": [
                {
                    "id": "general",
                    "title": "Общие",
                    "fields": [
                        { "key": "extra", "title": "Данные", "type": "json" }
                    ]
                }
            ]
        }
    });
    let _ = handle(
        &host,
        &request("register", serde_json::json!({ "sources": [source] })),
    )
    .expect("регистрация");
    let output = handle(
        &host,
        &request(
            "intent",
            serde_json::json!({
                "space": ui_sdk::SPACE_SETTINGS_SECTION,
                "id": "app.general",
                "action": ui::ACTION_SAVE,
                "values": { "extra": "не json" }
            }),
        ),
    )
    .expect("ответ с ошибкой");
    let parsed: serde_json::Value = serde_json::from_str(&output).expect("JSON");
    assert_eq!(parsed["error"], "Некорректное значение поля «Данные»");
    assert!(
        host.events.borrow().is_empty(),
        "некорректный интент не публикует событие"
    );
}

#[test]
fn intent_for_unknown_space_is_rejected() {
    let host = FakeHost::default();
    let result = handle(
        &host,
        &request(
            "intent",
            serde_json::json!({
                "space": "unknown.space",
                "id": "app.general",
                "action": ui::ACTION_SAVE,
                "values": {}
            }),
        ),
    );
    assert!(result.is_err());
}
