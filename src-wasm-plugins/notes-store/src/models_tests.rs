use super::*;

#[test]
fn note_roundtrip_preserves_anchor_and_metadata() {
    let note = Note {
        id: "note-1".to_string(),
        note_type: "quote".to_string(),
        anchor: "epubcfi(/6/4[chap01]!/4/2/2[para3])".to_string(),
        quote: "цитата".to_string(),
        chapter: "Глава 1".to_string(),
        title: "Тезис".to_string(),
        comment: "Проверить позже".to_string(),
        color: "green".to_string(),
        percent: Some(12.5),
        page: Some(42),
        text: "мысль".to_string(),
        shape: "line".to_string(),
        geometry: String::new(),
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
    assert!(
        note.title.is_empty(),
        "заметка без названия — пустое название"
    );
    assert!(
        note.comment.is_empty(),
        "заметка без комментария — пустой комментарий"
    );
    assert_eq!(
        note.color, DEFAULT_NOTE_COLOR,
        "заметка без цвета — цвет по умолчанию"
    );
    assert_eq!(
        note.note_type, DEFAULT_NOTE_TYPE,
        "заметка без типа — цитата"
    );
    assert_eq!(
        note.shape, DEFAULT_SHAPE,
        "заметка без вида фигуры — вид по умолчанию"
    );
    assert!(note.geometry.is_empty());
}

#[test]
fn normalize_color_keeps_palette_and_defaults_unknown() {
    assert_eq!(normalize_color("blue"), "blue");
    assert_eq!(normalize_color("  purple  "), "purple", "пробелы снимаются");
    assert_eq!(normalize_color("black"), "black", "чёрный — часть палитры");
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
fn normalize_type_keeps_known_and_defaults_unknown() {
    assert_eq!(normalize_type("text"), "text");
    assert_eq!(normalize_type("  shape  "), "shape", "пробелы снимаются");
    assert_eq!(
        normalize_type(""),
        DEFAULT_NOTE_TYPE,
        "пустое значение — цитата"
    );
    assert_eq!(
        normalize_type("sticker"),
        DEFAULT_NOTE_TYPE,
        "неизвестный тип — цитата"
    );
    assert_eq!(NOTE_TYPES.len(), 3);
}

#[test]
fn normalize_shape_keeps_known_and_defaults_unknown() {
    assert_eq!(normalize_shape("ellipse"), "ellipse");
    assert_eq!(
        normalize_shape("  rectangle  "),
        "rectangle",
        "пробелы снимаются"
    );
    assert_eq!(
        normalize_shape(""),
        DEFAULT_SHAPE,
        "пустое значение — вид по умолчанию"
    );
    assert_eq!(
        normalize_shape("hexagon"),
        DEFAULT_SHAPE,
        "неизвестный вид фигуры — вид по умолчанию"
    );
    assert_eq!(SHAPE_KINDS.len(), 3);
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
    assert_eq!(patch.title, None);
    assert_eq!(patch.comment, None);
    assert_eq!(patch.percent, None);
    assert_eq!(patch.page, None);
    assert_eq!(patch.note_type, None);
    assert_eq!(patch.shape, None);
    assert_eq!(patch.geometry, None);
}

#[test]
fn note_roundtrip_preserves_type_shape_and_geometry() {
    let note = Note {
        id: "note-2".to_string(),
        note_type: "shape".to_string(),
        anchor: "{\"kind\":\"point\"}".to_string(),
        quote: String::new(),
        chapter: String::new(),
        title: String::new(),
        comment: String::new(),
        color: "black".to_string(),
        percent: Some(1.0),
        page: None,
        text: String::new(),
        shape: "ellipse".to_string(),
        geometry: "{\"x\":0.1,\"y\":0.2}".to_string(),
        created_at_millis: 1,
        updated_at_millis: 2,
    };
    let json = serde_json::to_string(&note).expect("сериализация");
    assert!(
        json.contains("\"type\":\"shape\""),
        "тип сериализуется как type"
    );
    let restored: Note = serde_json::from_str(&json).expect("десериализация");
    assert_eq!(restored, note);
}

#[test]
fn note_input_reads_json_type_field() {
    let input: NoteInput =
        serde_json::from_str(r#"{ "type": "text", "shape": "rectangle", "geometry": "g" }"#)
            .expect("вход");
    assert_eq!(input.note_type.as_deref(), Some("text"));
    assert_eq!(input.shape.as_deref(), Some("rectangle"));
    assert_eq!(input.geometry, "g");
}

#[test]
fn note_and_patch_carry_title_and_comment() {
    let note: Note =
        serde_json::from_str(r#"{ "id": "note-1", "title": "Идея", "comment": "Разобрать" }"#)
            .expect("заметка без полей");
    assert_eq!(note.title, "Идея");
    assert_eq!(note.comment, "Разобрать");

    let patch: NotePatch =
        serde_json::from_str(r#"{ "title": "Новое", "comment": "" }"#).expect("патч");
    assert_eq!(patch.title.as_deref(), Some("Новое"));
    assert_eq!(
        patch.comment.as_deref(),
        Some(""),
        "явная пустая строка очищает комментарий"
    );
}
