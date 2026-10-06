use super::*;
use crate::models::DEFAULT_NOTE_COLOR;

#[test]
fn new_state_is_versioned_and_empty() {
    let state = NotesState::new();
    assert_eq!(state.version(), STATE_VERSION);
    assert!(state.sets().is_empty());
}

#[test]
fn create_set_trims_name_and_keeps_book() {
    let mut state = NotesState::new();
    let set = state
        .create_set("lib/book", "Война и мир", "  Набор  ", "ns-1", 100)
        .expect("создание");
    assert_eq!(set.name, "Набор");
    assert_eq!(set.book_key, "lib/book");
    assert_eq!(set.book_title, "Война и мир");
    assert_eq!(set.created_at_millis, 100);
    assert!(set.notes.is_empty());
    assert_eq!(state.sets().len(), 1);
}

#[test]
fn create_set_keeps_empty_book_title() {
    let mut state = NotesState::new();
    let set = state
        .create_set("lib/book", "  ", "Набор", "ns-1", 100)
        .expect("создание");
    assert!(
        set.book_title.is_empty(),
        "имя книги не выводится из ключа и обрезается"
    );
}

#[test]
fn create_set_rejects_empty_name() {
    let mut state = NotesState::new();
    assert!(state
        .create_set("lib/book", "", "   ", "ns-1", 100)
        .is_err());
    assert!(state.sets().is_empty());
}

#[test]
fn list_all_returns_sets_of_all_books_with_notes() {
    let mut state = NotesState::new();
    state
        .create_set("lib/a", "Книга A", "A", "ns-a", 1)
        .expect("набор A");
    state
        .create_set("lib/b", "Книга B", "B", "ns-b", 2)
        .expect("набор B");
    let note = NoteInput {
        text: "текст".to_string(),
        ..NoteInput::default()
    };
    state.add_note("ns-a", note, "note-1", 3).expect("заметка");

    let all = state.list_all();
    assert_eq!(all.len(), 2, "наборы всех книг");
    assert_eq!(all[0].book_key, "lib/a");
    assert_eq!(all[0].book_title, "Книга A");
    assert_eq!(all[0].notes.len(), 1, "заметки набора в агрегате");
    assert_eq!(all[1].book_key, "lib/b");
    assert_eq!(all[1].notes.len(), 0);

    assert!(NotesState::new().list_all().is_empty(), "пустое состояние");
}

#[test]
fn list_for_book_filters_and_counts_notes() {
    let mut state = NotesState::new();
    state
        .create_set("lib/a", "Книга A", "A", "ns-a", 1)
        .expect("набор A");
    state
        .create_set("lib/b", "Книга B", "B", "ns-b", 1)
        .expect("набор B");
    let note = NoteInput {
        text: "текст".to_string(),
        ..NoteInput::default()
    };
    state.add_note("ns-a", note, "note-1", 2).expect("заметка");

    let listed = state.list_for_book("lib/a");
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0]["id"], "ns-a");
    assert_eq!(listed[0]["book_title"], "Книга A");
    assert_eq!(listed[0]["note_count"], 1);

    assert!(state.list_for_book("lib/missing").is_empty());
}

#[test]
fn rename_set_rejects_empty_and_unknown() {
    let mut state = NotesState::new();
    state
        .create_set("lib/a", "", "A", "ns-a", 1)
        .expect("набор");
    assert!(state.rename_set("ns-a", "  ").is_err());
    assert!(state.rename_set("ns-missing", "B").is_err());
    assert_eq!(state.find("ns-a").expect("набор").name, "A");
}

#[test]
fn delete_set_removes_notes() {
    let mut state = NotesState::new();
    state
        .create_set("lib/a", "", "A", "ns-a", 1)
        .expect("набор");
    let note = NoteInput {
        text: "текст".to_string(),
        ..NoteInput::default()
    };
    state.add_note("ns-a", note, "note-1", 2).expect("заметка");

    state.delete_set("ns-a").expect("удаление");
    assert!(state.find("ns-a").is_none());
    assert!(state.list_for_book("lib/a").is_empty());
}

#[test]
fn add_note_applies_default_color_and_update_changes_it() {
    let mut state = NotesState::new();
    state
        .create_set("lib/a", "", "A", "ns-a", 1)
        .expect("набор");
    let input = NoteInput {
        quote: "цитата".to_string(),
        ..NoteInput::default()
    };
    let note = state
        .add_note("ns-a", input, "note-1", 10)
        .expect("заметка");
    assert_eq!(note.color, DEFAULT_NOTE_COLOR, "без цвета — жёлтый");

    let input = NoteInput {
        quote: "цитата".to_string(),
        color: Some("blue".to_string()),
        ..NoteInput::default()
    };
    let note = state
        .add_note("ns-a", input, "note-2", 11)
        .expect("заметка");
    assert_eq!(note.color, "blue");

    let patch = NotePatch {
        color: Some("chartreuse".to_string()),
        ..NotePatch::default()
    };
    let note = state
        .update_note("ns-a", "note-1", patch, 12)
        .expect("смена цвета");
    assert_eq!(
        note.color, DEFAULT_NOTE_COLOR,
        "неизвестный цвет заменён цветом по умолчанию"
    );

    let patch = NotePatch {
        color: Some("purple".to_string()),
        ..NotePatch::default()
    };
    let note = state
        .update_note("ns-a", "note-2", patch, 13)
        .expect("смена цвета");
    assert_eq!(note.color, "purple");
}

#[test]
fn normalized_replaces_bad_color_with_default() {
    let raw = r#"{
      "version": 1,
      "sets": [
        {
          "id": "ns-1",
          "book_key": "lib/a",
          "name": "A",
          "notes": [
            { "id": "note-old" },
            { "id": "note-bad", "color": "chartreuse" }
          ]
        }
      ]
    }"#;
    let state: NotesState = serde_json::from_str(raw).expect("разбор");
    let state = state.normalized();
    let notes = &state.find("ns-1").expect("набор").notes;
    assert_eq!(
        notes[0].color, DEFAULT_NOTE_COLOR,
        "старая заметка — жёлтая"
    );
    assert_eq!(
        notes[1].color, DEFAULT_NOTE_COLOR,
        "неизвестный цвет — жёлтый"
    );
}

#[test]
fn add_note_sets_times_and_allows_same_anchor() {
    let mut state = NotesState::new();
    state
        .create_set("lib/a", "", "A", "ns-a", 1)
        .expect("набор");
    let input = NoteInput {
        anchor: "cfi".to_string(),
        quote: "цитата".to_string(),
        chapter: "Глава".to_string(),
        color: None,
        percent: Some(3.0),
        page: Some(4),
        text: "первая".to_string(),
        ..NoteInput::default()
    };
    let first = state
        .add_note("ns-a", input.clone(), "note-1", 10)
        .expect("первая");
    assert_eq!(first.created_at_millis, 10);
    assert_eq!(first.updated_at_millis, 10);
    assert_eq!(first.anchor, "cfi");
    assert_eq!(first.page, Some(4));

    let second = state.add_note("ns-a", input, "note-2", 11).expect("вторая");
    let set = state.find("ns-a").expect("набор");
    assert_eq!(set.notes.len(), 2, "одинаковый якорь допускается");
    assert_eq!(second.percent, Some(3.0));
}

#[test]
fn update_note_patches_fields_and_time() {
    let mut state = NotesState::new();
    state
        .create_set("lib/a", "", "A", "ns-a", 1)
        .expect("набор");
    let input = NoteInput {
        quote: "старая".to_string(),
        chapter: "Старая глава".to_string(),
        text: "старый".to_string(),
        ..NoteInput::default()
    };
    state
        .add_note("ns-a", input, "note-1", 10)
        .expect("заметка");
    let patch = NotePatch {
        text: Some("новый".to_string()),
        chapter: Some("Новая глава".to_string()),
        anchor: Some("{\"v\":1}".to_string()),
        ..NotePatch::default()
    };
    let note = state
        .update_note("ns-a", "note-1", patch, 20)
        .expect("изменение");
    assert_eq!(note.text, "новый");
    assert_eq!(note.chapter, "Новая глава");
    assert_eq!(note.anchor, "{\"v\":1}", "якорь места обновлён");
    assert_eq!(note.quote, "старая", "непереданное поле сохранено");
    assert_eq!(note.updated_at_millis, 20);
    assert_eq!(note.created_at_millis, 10);
}

#[test]
fn update_note_sets_and_clears_title_and_comment() {
    let mut state = NotesState::new();
    state
        .create_set("lib/a", "", "A", "ns-a", 1)
        .expect("набор");
    let input = NoteInput {
        quote: "цитата".to_string(),
        title: "Черновик".to_string(),
        comment: "Проверить".to_string(),
        ..NoteInput::default()
    };
    let note = state
        .add_note("ns-a", input, "note-1", 10)
        .expect("заметка");
    assert_eq!(note.title, "Черновик");
    assert_eq!(note.comment, "Проверить");

    // Частичный патч меняет только название и не трогает комментарий.
    let patch = NotePatch {
        title: Some("Итог".to_string()),
        ..NotePatch::default()
    };
    let note = state
        .update_note("ns-a", "note-1", patch, 11)
        .expect("изменение названия");
    assert_eq!(note.title, "Итог");
    assert_eq!(
        note.comment, "Проверить",
        "комментарий не передан — сохранён"
    );

    // Явная пустая строка очищает комментарий, поле остаётся допустимым.
    let patch = NotePatch {
        comment: Some(String::new()),
        ..NotePatch::default()
    };
    let note = state
        .update_note("ns-a", "note-1", patch, 12)
        .expect("очистка комментария");
    assert!(note.comment.is_empty());
    assert_eq!(note.updated_at_millis, 12);
}

#[test]
fn add_note_applies_default_type_shape_and_black_color() {
    let mut state = NotesState::new();
    state
        .create_set("lib/a", "", "A", "ns-a", 1)
        .expect("набор");

    // Заметка без типа — цитата; без вида фигуры — вид по умолчанию.
    let note = state
        .add_note("ns-a", NoteInput::default(), "note-1", 10)
        .expect("заметка");
    assert_eq!(note.note_type, crate::models::DEFAULT_NOTE_TYPE);
    assert_eq!(note.shape, crate::models::DEFAULT_SHAPE);
    assert!(note.geometry.is_empty());

    // Чёрный цвет принимается как часть палитры.
    let input = NoteInput {
        note_type: Some("shape".to_string()),
        color: Some("black".to_string()),
        shape: Some("ellipse".to_string()),
        geometry: "g".to_string(),
        ..NoteInput::default()
    };
    let note = state.add_note("ns-a", input, "note-2", 11).expect("фигура");
    assert_eq!(note.note_type, "shape");
    assert_eq!(note.color, "black");
    assert_eq!(note.shape, "ellipse");
    assert_eq!(note.geometry, "g");
}

#[test]
fn add_note_defaults_unknown_type_and_shape() {
    let mut state = NotesState::new();
    state
        .create_set("lib/a", "", "A", "ns-a", 1)
        .expect("набор");
    let input = NoteInput {
        note_type: Some("sticker".to_string()),
        shape: Some("hexagon".to_string()),
        ..NoteInput::default()
    };
    let note = state.add_note("ns-a", input, "note-1", 1).expect("заметка");
    assert_eq!(note.note_type, "quote", "неизвестный тип — цитата");
    assert_eq!(
        note.shape, "line",
        "неизвестный вид фигуры — вид по умолчанию"
    );
}

#[test]
fn update_note_patches_type_and_geometry() {
    let mut state = NotesState::new();
    state
        .create_set("lib/a", "", "A", "ns-a", 1)
        .expect("набор");
    state
        .add_note("ns-a", NoteInput::default(), "note-1", 10)
        .expect("заметка");
    let patch = NotePatch {
        note_type: Some("text".to_string()),
        text: Some("мысль".to_string()),
        geometry: Some("g2".to_string()),
        ..NotePatch::default()
    };
    let note = state
        .update_note("ns-a", "note-1", patch, 20)
        .expect("изменение");
    assert_eq!(note.note_type, "text");
    assert_eq!(note.text, "мысль");
    assert_eq!(note.geometry, "g2");
    assert_eq!(note.quote, "", "непереданное поле сохранено");
}

#[test]
fn normalized_reads_legacy_note_as_quote_without_geometry() {
    let raw = r#"{
      "version": 1,
      "sets": [
        {
          "id": "ns-1",
          "book_key": "lib/a",
          "name": "A",
          "notes": [ { "id": "note-old", "quote": "цитата" } ]
        }
      ]
    }"#;
    let state: NotesState = serde_json::from_str(raw).expect("разбор");
    let state = state.normalized();
    let note = &state.find("ns-1").expect("набор").notes[0];
    assert_eq!(note.note_type, "quote", "старая заметка — цитата");
    assert_eq!(note.shape, "line");
    assert!(note.geometry.is_empty());
}

#[test]
fn normalized_replaces_bad_type_and_shape() {
    let raw = r#"{
      "version": 1,
      "sets": [
        {
          "id": "ns-1",
          "book_key": "lib/a",
          "name": "A",
          "notes": [
            { "id": "note-1", "type": "sticker", "shape": "hexagon" }
          ]
        }
      ]
    }"#;
    let state: NotesState = serde_json::from_str(raw).expect("разбор");
    let state = state.normalized();
    let note = &state.find("ns-1").expect("набор").notes[0];
    assert_eq!(note.note_type, "quote");
    assert_eq!(note.shape, "line");
}

#[test]
fn normalized_shape_note_without_geometry_is_safe() {
    let raw = r#"{
      "version": 1,
      "sets": [
        {
          "id": "ns-1",
          "book_key": "lib/a",
          "name": "A",
          "notes": [ { "id": "note-1", "type": "shape" } ]
        }
      ]
    }"#;
    let state: NotesState = serde_json::from_str(raw).expect("разбор");
    let state = state.normalized();
    let note = &state.find("ns-1").expect("набор").notes[0];
    assert_eq!(note.note_type, "shape");
    assert!(note.geometry.is_empty(), "пустая геометрия безопасна");
}

#[test]
fn normalized_accepts_black_color() {
    let raw = r#"{
      "version": 1,
      "sets": [
        {
          "id": "ns-1",
          "book_key": "lib/a",
          "name": "A",
          "notes": [ { "id": "note-1", "color": "black" } ]
        }
      ]
    }"#;
    let state: NotesState = serde_json::from_str(raw).expect("разбор");
    let state = state.normalized();
    assert_eq!(state.find("ns-1").expect("набор").notes[0].color, "black");
}

#[test]
fn note_operations_reject_unknown_set() {
    let mut state = NotesState::new();
    let input = NoteInput::default();
    assert!(state.add_note("ns-missing", input, "note-1", 1).is_err());
    assert!(state
        .update_note("ns-missing", "note-1", NotePatch::default(), 1)
        .is_err());
    assert!(state.delete_note("ns-missing", "note-1").is_err());
}

#[test]
fn normalized_drops_items_without_id_and_reports_bad_fields() {
    let raw = r#"{
      "version": 1,
      "sets": [
        { "id": "  ", "book_key": "lib/a", "name": "пусто" },
        {
          "id": "ns-1",
          "book_key": " lib/a ",
          "name": " A ",
          "created_at_millis": -5,
          "notes": [
            { "id": "" },
            { "id": "note-1", "percent": 12.5 }
          ]
        }
      ]
    }"#;
    let state: NotesState = serde_json::from_str(raw).expect("разбор");
    let state = state.normalized();
    assert_eq!(state.sets().len(), 1);
    let set = state.find("ns-1").expect("набор");
    assert_eq!(set.book_key, "lib/a");
    assert_eq!(set.name, "A");
    assert_eq!(set.created_at_millis, 0);
    assert_eq!(set.notes.len(), 1);
    assert_eq!(set.notes[0].id, "note-1");
    assert_eq!(set.notes[0].percent, Some(12.5));
}

#[test]
fn normalized_drops_non_finite_percent() {
    let mut state = NotesState::new();
    state
        .create_set("lib/a", "", "A", "ns-1", 1)
        .expect("набор");
    let input = NoteInput {
        percent: Some(f64::NAN),
        ..NoteInput::default()
    };
    state.add_note("ns-1", input, "note-1", 2).expect("заметка");

    let state = state.normalized();
    let note = &state.find("ns-1").expect("набор").notes[0];
    assert_eq!(note.percent, None, "нечисловая доля отброшена");
}

#[test]
fn missing_version_defaults_to_current() {
    let state: NotesState = serde_json::from_str(r#"{ "sets": [] }"#).expect("разбор");
    assert_eq!(state.normalized().version(), STATE_VERSION);
}

#[test]
fn create_set_becomes_active_for_book() {
    let mut state = NotesState::new();
    state
        .create_set("lib/a", "", "A", "ns-a", 1)
        .expect("набор");
    assert_eq!(state.active_for_book("lib/a"), Some("ns-a"));

    state
        .create_set("lib/a", "", "B", "ns-b", 2)
        .expect("набор");
    assert_eq!(state.active_for_book("lib/a"), Some("ns-b"));
}

#[test]
fn set_active_requires_set_of_same_book() {
    let mut state = NotesState::new();
    state
        .create_set("lib/a", "", "A", "ns-a", 1)
        .expect("набор");
    state
        .create_set("lib/b", "", "B", "ns-b", 1)
        .expect("набор");

    state.set_active("lib/a", "ns-a").expect("выбор");
    assert_eq!(state.active_for_book("lib/a"), Some("ns-a"));

    assert!(state.set_active("lib/a", "ns-b").is_err(), "чужой набор");
    assert!(state.set_active("lib/a", "ns-missing").is_err());
    assert_eq!(state.active_for_book("lib/a"), Some("ns-a"));
}

#[test]
fn delete_active_set_clears_selection() {
    let mut state = NotesState::new();
    state
        .create_set("lib/a", "", "A", "ns-a", 1)
        .expect("набор");
    state.set_active("lib/a", "ns-a").expect("выбор");
    state.delete_set("ns-a").expect("удаление");
    assert_eq!(state.active_for_book("lib/a"), None);
}

#[test]
fn normalized_keeps_only_valid_active_selections() {
    let raw = r#"{
      "version": 1,
      "sets": [
        { "id": "ns-a", "book_key": "lib/a", "name": "A" },
        { "id": "ns-b", "book_key": "lib/b", "name": "B" }
      ],
      "active": { "lib/a": "ns-a", "lib/b": "ns-a", "": "ns-a", "lib/a-missing": "ns-x" }
    }"#;
    let state: NotesState = serde_json::from_str(raw).expect("разбор");
    let state = state.normalized();
    assert_eq!(state.active_for_book("lib/a"), Some("ns-a"));
    assert_eq!(state.active_for_book("lib/b"), None, "чужой набор");
    assert_eq!(
        state.active,
        BTreeMap::from([("lib/a".to_string(), "ns-a".to_string())])
    );
}
