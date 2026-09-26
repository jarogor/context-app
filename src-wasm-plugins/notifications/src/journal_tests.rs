use super::*;

/// Фиксированная метка времени для тестов.
const TS: i64 = 1_000;

#[test]
fn add_user_entry() {
    let mut journal = Journal::new();
    let entry = journal.add_user(TS, "событие", Severity::Info, "test", serde_json::json!({}));
    assert_eq!(entry.level, Level::User);
    assert_eq!(entry.severity, Severity::Info);
    assert_eq!(entry.timestamp, TS);
    assert!(!entry.read);
    assert_eq!(journal.len(), 1);
}

#[test]
fn add_technical_entry() {
    let mut journal = Journal::new();
    let entry = journal.add_technical(TS, "отладка", Severity::Info, "test", serde_json::json!({}));
    assert_eq!(entry.level, Level::Technical);
    assert_eq!(entry.severity, Severity::Info);
}

#[test]
fn list_filters_by_level() {
    let mut journal = Journal::new();
    let _ = journal.add_user(TS, "u", Severity::Info, "test", serde_json::json!({}));
    let _ = journal.add_technical(TS, "t", Severity::Info, "test", serde_json::json!({}));
    assert_eq!(journal.list(None).len(), 2);
    assert_eq!(journal.list(Some(Level::User)).len(), 1);
    assert_eq!(journal.list(Some(Level::Technical)).len(), 1);
}

#[test]
fn mark_read_specific_ids() {
    let mut journal = Journal::new();
    let first = journal.add_user(TS, "a", Severity::Info, "test", serde_json::json!({}));
    let _ = journal.add_user(TS, "b", Severity::Info, "test", serde_json::json!({}));
    journal.mark_read(&[first.id]);
    let entries = journal.list(None);
    assert!(entries[0].read);
    assert!(!entries[1].read);
}

#[test]
fn mark_all_read_marks_every_entry() {
    let mut journal = Journal::new();
    let _ = journal.add_user(TS, "a", Severity::Info, "test", serde_json::json!({}));
    let _ = journal.add_technical(TS, "b", Severity::Info, "test", serde_json::json!({}));
    journal.mark_all_read();
    assert!(journal.list(None).iter().all(|entry| entry.read));
}

#[test]
fn clear_empties_journal_and_resets_ids() {
    let mut journal = Journal::new();
    let _ = journal.add_user(TS, "a", Severity::Info, "test", serde_json::json!({}));
    journal.clear();
    assert!(journal.is_empty());
    let entry = journal.add_user(TS, "b", Severity::Info, "test", serde_json::json!({}));
    assert_eq!(entry.id, 0, "идентификаторы сброшены");
}

#[test]
fn bounded_size_keeps_latest_entries() {
    let mut journal = Journal::new();
    for index in 0..MAX_ENTRIES + 50 {
        let _ = journal.add_user(
            TS,
            format!("event-{index}"),
            Severity::Info,
            "test",
            serde_json::json!({}),
        );
    }
    assert_eq!(journal.len(), MAX_ENTRIES);
    let entries = journal.list(None);
    assert_eq!(entries[0].message, "event-50");
}

#[test]
fn state_round_trip() {
    let mut journal = Journal::new();
    let _ = journal.add_user(
        TS,
        "a",
        Severity::Warn,
        "test",
        serde_json::json!({ "x": 1 }),
    );
    journal.mark_all_read();
    let json = serde_json::to_string(&journal).expect("сериализация");
    let restored: Journal = serde_json::from_str(&json).expect("десериализация");
    assert_eq!(journal.list(None), restored.list(None));
    assert_eq!(restored.len(), 1);
}

#[test]
fn deserializes_legacy_severity_names() {
    let json = r#"{"entries":[{"id":0,"timestamp":1,"level":"Technical","severity":"Info","message":"m","source":"s","details":{},"read":false}],"next_id":1}"#;
    let journal: Journal = serde_json::from_str(json).expect("старый формат степени");
    assert_eq!(journal.len(), 1);
    assert_eq!(journal.list(None)[0].severity, Severity::Info);
}
