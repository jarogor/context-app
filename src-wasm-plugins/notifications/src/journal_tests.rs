use super::*;

#[test]
fn add_user_entry() {
    let mut journal = Journal::new();
    let entry = journal.add_user("событие", Severity::Info, "test", serde_json::json!({}));
    assert_eq!(entry.level, Level::User);
    assert_eq!(entry.severity, Severity::Info);
    assert!(!entry.read);
    assert_eq!(journal.len(), 1);
}

#[test]
fn add_technical_entry() {
    let mut journal = Journal::new();
    let entry = journal.add_technical("отладка", "test", serde_json::json!({}));
    assert_eq!(entry.level, Level::Technical);
    assert_eq!(entry.severity, Severity::Info);
}

#[test]
fn list_filters_by_level() {
    let mut journal = Journal::new();
    let _ = journal.add_user("u", Severity::Info, "test", serde_json::json!({}));
    let _ = journal.add_technical("t", "test", serde_json::json!({}));
    assert_eq!(journal.list(None).len(), 2);
    assert_eq!(journal.list(Some(Level::User)).len(), 1);
    assert_eq!(journal.list(Some(Level::Technical)).len(), 1);
}

#[test]
fn mark_read_specific_ids() {
    let mut journal = Journal::new();
    let first = journal.add_user("a", Severity::Info, "test", serde_json::json!({}));
    let _ = journal.add_user("b", Severity::Info, "test", serde_json::json!({}));
    journal.mark_read(&[first.id]);
    let entries = journal.list(None);
    assert!(entries[0].read);
    assert!(!entries[1].read);
}

#[test]
fn mark_all_read_marks_every_entry() {
    let mut journal = Journal::new();
    let _ = journal.add_user("a", Severity::Info, "test", serde_json::json!({}));
    let _ = journal.add_technical("b", "test", serde_json::json!({}));
    journal.mark_all_read();
    assert!(journal.list(None).iter().all(|entry| entry.read));
}

#[test]
fn clear_empties_journal_and_resets_ids() {
    let mut journal = Journal::new();
    let _ = journal.add_user("a", Severity::Info, "test", serde_json::json!({}));
    journal.clear();
    assert!(journal.is_empty());
    let entry = journal.add_user("b", Severity::Info, "test", serde_json::json!({}));
    assert_eq!(entry.id, 0, "идентификаторы сброшены");
}

#[test]
fn bounded_size_keeps_latest_entries() {
    let mut journal = Journal::new();
    for index in 0..MAX_ENTRIES + 50 {
        let _ = journal.add_user(
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
    let _ = journal.add_user("a", Severity::Warn, "test", serde_json::json!({ "x": 1 }));
    journal.mark_all_read();
    let json = serde_json::to_string(&journal).expect("сериализация");
    let restored: Journal = serde_json::from_str(&json).expect("десериализация");
    assert_eq!(journal.list(None), restored.list(None));
    assert_eq!(restored.len(), 1);
}
