use super::*;

#[test]
fn note_roundtrip_preserves_anchor_and_metadata() {
    let note = Note {
        id: "note-1".to_string(),
        anchor: "epubcfi(/6/4[chap01]!/4/2/2[para3])".to_string(),
        quote: "цитата".to_string(),
        chapter: "Глава 1".to_string(),
        color: "green".to_string(),
        percent: Some(12.5),
        page: Some(42),
        text: "мысль".to_string(),
        created_at_millis: 10,
        updated_at_millis: 20,
    };
    let json = serde_json::to_string(&note).expect("сериализация");
    let restored: Note = serde_json::from_str(&json).expect("десериализация");
    assert_eq!(restored, note);
}

#[test]
fn note_accepts_missing_optional_fields() {
    let note: Note = serde_json::from_str(r#"{ "id": "note-1" }"#).expect("минимальная заметка");
    assert_eq!(note.id, "note-1");
    assert_eq!(note.percent, None);
    assert_eq!(note.page, None);
    assert!(note.anchor.is_empty());
    assert!(note.text.is_empty());
    assert_eq!(
        note.color, DEFAULT_NOTE_COLOR,
        "заметка без цвета — цвет по умолчанию"
    );
}

#[test]
fn normalize_color_keeps_palette_and_defaults_unknown() {
    assert_eq!(normalize_color("blue"), "blue");
    assert_eq!(normalize_color("  purple  "), "purple", "пробелы снимаются");
    assert_eq!(
        normalize_color(""),
        DEFAULT_NOTE_COLOR,
        "пустое значение — по умолчанию"
    );
    assert_eq!(
        normalize_color("chartreuse"),
        DEFAULT_NOTE_COLOR,
        "неизвестный цвет — по умолчанию"
    );
    assert_eq!(NOTE_COLORS.len(), 6);
}

#[test]
fn note_set_roundtrip() {
    let set = NoteSet {
        id: "ns-1".to_string(),
        book_key: "lib/book".to_string(),
        name: "Набор".to_string(),
        created_at_millis: 5,
        notes: Vec::new(),
    };
    let json = serde_json::to_string(&set).expect("сериализация");
    let restored: NoteSet = serde_json::from_str(&json).expect("десериализация");
    assert_eq!(restored, set);
}

#[test]
fn note_patch_ignores_absent_fields() {
    let patch: NotePatch = serde_json::from_str(r#"{ "text": "новый" }"#).expect("патч");
    assert_eq!(patch.text.as_deref(), Some("новый"));
    assert_eq!(patch.quote, None);
    assert_eq!(patch.chapter, None);
    assert_eq!(patch.percent, None);
    assert_eq!(patch.page, None);
}
