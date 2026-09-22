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

fn request(action: &str, payload: serde_json::Value) -> String {
    serde_json::json!({ "action": action, "payload": payload }).to_string()
}

#[test]
fn publish_user_creates_entry_and_event() {
    let host = FakeHost::default();
    let output = handle(
        &host,
        &request(
            "publish",
            serde_json::json!({ "level": "user", "message": "готово", "source": "test" }),
        ),
    )
    .expect("публикация");
    let entry: serde_json::Value = serde_json::from_str(&output).expect("JSON записи");
    assert_eq!(entry["level"], "User");
    assert_eq!(entry["message"], "готово");
    assert_eq!(entry["severity"], "Info");
    assert_eq!(entry["read"], false);

    let events = host.events.borrow();
    assert_eq!(events.len(), 1, "событие опубликовано");
    assert_eq!(events[0].0, "notifications:added");
    assert_eq!(events[0].1, output);
}

#[test]
fn publish_technical_uses_technical_level() {
    let host = FakeHost::default();
    let output = handle(
        &host,
        &request(
            "publish",
            serde_json::json!({ "level": "technical", "message": "шум" }),
        ),
    )
    .expect("публикация");
    let entry: serde_json::Value = serde_json::from_str(&output).expect("JSON записи");
    assert_eq!(entry["level"], "Technical");
    assert_eq!(entry["source"], "plugin", "источник по умолчанию");
}

#[test]
fn publish_reads_severity_and_details() {
    let host = FakeHost::default();
    let output = handle(
        &host,
        &request(
            "publish",
            serde_json::json!({
                "level": "user",
                "message": "ошибка",
                "severity": "Error",
                "details": { "path": "book.epub" }
            }),
        ),
    )
    .expect("публикация");
    let entry: serde_json::Value = serde_json::from_str(&output).expect("JSON записи");
    assert_eq!(entry["severity"], "Error");
    assert_eq!(entry["details"]["path"], "book.epub");
}

#[test]
fn list_returns_persisted_entries() {
    let host = FakeHost::default();
    let _ = handle(
        &host,
        &request(
            "publish",
            serde_json::json!({ "level": "user", "message": "a" }),
        ),
    )
    .expect("публикация");
    let _ = handle(
        &host,
        &request(
            "publish",
            serde_json::json!({ "level": "technical", "message": "b" }),
        ),
    )
    .expect("публикация");

    let output = handle(&host, &request("list", serde_json::json!({}))).expect("список");
    let parsed: serde_json::Value = serde_json::from_str(&output).expect("JSON списка");
    assert_eq!(parsed["entries"].as_array().expect("массив").len(), 2);

    let filtered = handle(
        &host,
        &request("list", serde_json::json!({ "level": "User" })),
    )
    .expect("список");
    let parsed: serde_json::Value = serde_json::from_str(&filtered).expect("JSON списка");
    assert_eq!(parsed["entries"].as_array().expect("массив").len(), 1);
}

#[test]
fn mark_read_persists_state() {
    let host = FakeHost::default();
    let first = handle(
        &host,
        &request(
            "publish",
            serde_json::json!({ "level": "user", "message": "a" }),
        ),
    )
    .expect("публикация");
    let id = serde_json::from_str::<serde_json::Value>(&first).expect("JSON")["id"].clone();
    handle(
        &host,
        &request("mark_read", serde_json::json!({ "ids": [id] })),
    )
    .expect("отметка");
    let output = handle(&host, &request("list", serde_json::json!({}))).expect("список");
    let parsed: serde_json::Value = serde_json::from_str(&output).expect("JSON списка");
    assert_eq!(parsed["entries"][0]["read"], true);
}

#[test]
fn mark_all_read_marks_entries() {
    let host = FakeHost::default();
    let _ = handle(
        &host,
        &request(
            "publish",
            serde_json::json!({ "level": "user", "message": "a" }),
        ),
    )
    .expect("публикация");
    handle(&host, &request("mark_all_read", serde_json::json!({}))).expect("отметка");
    let output = handle(&host, &request("list", serde_json::json!({}))).expect("список");
    let parsed: serde_json::Value = serde_json::from_str(&output).expect("JSON списка");
    assert_eq!(parsed["entries"][0]["read"], true);
}

#[test]
fn clear_removes_entries() {
    let host = FakeHost::default();
    let _ = handle(
        &host,
        &request(
            "publish",
            serde_json::json!({ "level": "user", "message": "a" }),
        ),
    )
    .expect("публикация");
    handle(&host, &request("clear", serde_json::json!({}))).expect("очистка");
    let output = handle(&host, &request("list", serde_json::json!({}))).expect("список");
    let parsed: serde_json::Value = serde_json::from_str(&output).expect("JSON списка");
    assert_eq!(parsed["entries"].as_array().expect("массив").len(), 0);
}

#[test]
fn unknown_action_is_rejected() {
    let host = FakeHost::default();
    let result = handle(&host, &request("unknown", serde_json::json!({})));
    assert!(result.is_err());
}

#[test]
fn state_is_json_serializable() {
    let host = FakeHost::default();
    let _ = handle(
        &host,
        &request(
            "publish",
            serde_json::json!({ "level": "user", "message": "a" }),
        ),
    )
    .expect("публикация");
    let state = host.state.borrow().clone().expect("состояние записано");
    let journal: Journal = serde_json::from_str(&state).expect("состояние парсится");
    assert_eq!(journal.len(), 1);
}
