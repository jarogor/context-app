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
    let parsed: SettingsState = serde_json::from_str(&state).expect("состояние парсится");
    assert_eq!(parsed.registry().len(), 1);
}

#[test]
fn unknown_action_is_rejected() {
    let host = FakeHost::default();
    let result = handle(&host, &request("unknown", serde_json::json!({})));
    assert!(result.is_err());
}
