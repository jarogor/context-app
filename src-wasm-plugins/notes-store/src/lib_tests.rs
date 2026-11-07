use super::*;
use std::cell::RefCell;
use std::collections::BTreeMap;

/// Фейковые host-функции для нативных тестов.
#[derive(Default)]
struct FakeHost {
    /// Служебное состояние плагина.
    state: RefCell<Option<String>>,
    /// Опубликованные события.
    events: RefCell<Vec<(String, String)>>,
    /// Файлы импорта по пути.
    files: RefCell<BTreeMap<String, Vec<u8>>>,
}

impl FakeHost {
    /// Окружение с одним файлом импорта по пути `/tmp/set.notes.json`.
    fn with_import_file(text: &str) -> Self {
        let host = Self::default();
        host.files
            .borrow_mut()
            .insert(IMPORT_PATH.to_string(), text.as_bytes().to_vec());
        host
    }
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

    fn now_millis(&self) -> i64 {
        1_000
    }

    fn import_read_bytes(&self, path: &str) -> Result<Vec<u8>, String> {
        self.files
            .borrow()
            .get(path)
            .cloned()
            .ok_or_else(|| "файл импорта не читается".to_string())
    }
}

/// Путь файла импорта в тестах.
const IMPORT_PATH: &str = "/tmp/set.notes.json";

/// Запрос по контракту.
fn request(action: &str, payload: serde_json::Value) -> String {
    json!({ "action": action, "payload": payload }).to_string()
}

/// Разбор ответа как JSON.
fn parse(output: &str) -> serde_json::Value {
    serde_json::from_str(output).expect("JSON ответа")
}

/// Создание набора для книги и возврат его идентификатора.
fn create(host: &FakeHost, book_key: &str, name: &str) -> String {
    let output = handle(
        host,
        &request("create_set", json!({ "book_key": book_key, "name": name })),
    )
    .expect("создание набора");
    parse(&output)["set"]["id"]
        .as_str()
        .expect("идентификатор")
        .to_string()
}

#[test]
fn unknown_action_is_rejected() {
    let host = FakeHost::default();
    assert!(handle(&host, &request("unknown", json!({}))).is_err());
}

#[test]
fn malformed_request_is_rejected() {
    let host = FakeHost::default();
    assert!(handle(&host, "не JSON").is_err());
}

#[test]
fn create_set_returns_new_set_and_emits_event() {
    let host = FakeHost::default();
    let output = handle(
        &host,
        &request(
            "create_set",
            json!({ "book_key": "lib/a", "name": "Мой набор" }),
        ),
    )
    .expect("создание");
    let parsed = parse(&output);
    assert_eq!(parsed["set"]["name"], "Мой набор");
    assert_eq!(parsed["set"]["book_key"], "lib/a");
    assert!(parsed["set"]["notes"]
        .as_array()
        .expect("заметки")
        .is_empty());
    assert!(
        parsed["set"]["id"]
            .as_str()
            .expect("идентификатор")
            .starts_with("ns-"),
        "новый идентификатор набора"
    );

    let events = host.events.borrow();
    assert_eq!(events.len(), 1, "событие опубликовано");
    assert_eq!(events[0].0, "notes:changed");
    let event = parse(&events[0].1);
    assert_eq!(event["book_key"], "lib/a");
    let event_set_id = event["set_id"].as_str().expect("идентификатор в событии");
    assert_eq!(
        event_set_id,
        parsed["set"]["id"].as_str().expect("идентификатор")
    );
}

#[test]
fn create_set_rejects_empty_name() {
    let host = FakeHost::default();
    let result = handle(
        &host,
        &request("create_set", json!({ "book_key": "lib/a", "name": "   " })),
    );
    assert!(result.is_err());
    let listed =
        handle(&host, &request("list_sets", json!({ "book_key": "lib/a" }))).expect("список");
    assert!(parse(&listed)["sets"]
        .as_array()
        .expect("наборы")
        .is_empty());
}

#[test]
fn list_sets_is_scoped_to_book() {
    let host = FakeHost::default();
    let first = create(&host, "lib/a", "A");
    let _ = create(&host, "lib/b", "B");

    let listed =
        handle(&host, &request("list_sets", json!({ "book_key": "lib/a" }))).expect("список");
    let sets = parse(&listed)["sets"].as_array().expect("наборы").clone();
    assert_eq!(sets.len(), 1);
    assert_eq!(sets[0]["id"], first);
    assert_eq!(sets[0]["note_count"], 0);
}

#[test]
fn list_all_sets_returns_all_books_without_event() {
    let host = FakeHost::default();
    handle(
        &host,
        &request(
            "create_set",
            json!({ "book_key": "lib/a", "book_title": "Книга A", "name": "A" }),
        ),
    )
    .expect("набор A");
    let second = create(&host, "lib/b", "B");
    let events_before = host.events.borrow().len();

    let output = handle(&host, &request("list_all_sets", json!({}))).expect("агрегат");
    let sets = parse(&output)["sets"].as_array().expect("наборы").clone();
    assert_eq!(sets.len(), 2, "наборы всех книг");
    assert_eq!(sets[0]["book_title"], "Книга A");
    assert_eq!(sets[1]["id"], second.as_str());
    assert!(sets[0]["notes"].as_array().expect("заметки").is_empty());
    assert_eq!(
        host.events.borrow().len(),
        events_before,
        "чтение агрегата не публикует событие"
    );
}

#[test]
fn list_all_sets_is_empty_without_sets() {
    let host = FakeHost::default();
    let output = handle(&host, &request("list_all_sets", json!({}))).expect("агрегат");
    assert!(parse(&output)["sets"]
        .as_array()
        .expect("наборы")
        .is_empty());
}

#[test]
fn create_set_keeps_book_title_and_survives_reload() {
    let host = FakeHost::default();
    let output = handle(
        &host,
        &request(
            "create_set",
            json!({ "book_key": "lib/a", "book_title": "  Война и мир  ", "name": "A" }),
        ),
    )
    .expect("создание");
    assert_eq!(parse(&output)["set"]["book_title"], "Война и мир");

    let listed =
        handle(&host, &request("list_sets", json!({ "book_key": "lib/a" }))).expect("список");
    assert_eq!(parse(&listed)["sets"][0]["book_title"], "Война и мир");

    let stored = host.state.borrow().clone().expect("состояние записано");
    let state: NotesState = serde_json::from_str(&stored).expect("состояние парсится");
    assert_eq!(
        state
            .find(parse(&output)["set"]["id"].as_str().expect("идентификатор"))
            .expect("набор")
            .book_title,
        "Война и мир",
        "имя книги переживает перезагрузку"
    );
}

#[test]
fn create_set_without_book_title_keeps_it_empty() {
    let host = FakeHost::default();
    let output = handle(
        &host,
        &request("create_set", json!({ "book_key": "lib/a", "name": "A" })),
    )
    .expect("создание");
    assert_eq!(
        parse(&output)["set"]["book_title"],
        "",
        "имя книги не выводится из ключа"
    );
}

#[test]
fn get_set_returns_full_set_and_rejects_unknown() {
    let host = FakeHost::default();
    let set_id = create(&host, "lib/a", "A");
    handle(
        &host,
        &request(
            "add_note",
            json!({
                "set_id": set_id,
                "note": { "anchor": "cfi", "text": "мысль" }
            }),
        ),
    )
    .expect("заметка");

    let output = handle(&host, &request("get_set", json!({ "set_id": set_id }))).expect("набор");
    let set = &parse(&output)["set"];
    assert_eq!(set["id"], set_id.as_str());
    assert_eq!(set["notes"].as_array().expect("заметки").len(), 1);

    assert!(handle(
        &host,
        &request("get_set", json!({ "set_id": "ns-missing" }))
    )
    .is_err());
}

#[test]
fn rename_and_delete_set() {
    let host = FakeHost::default();
    let set_id = create(&host, "lib/a", "A");

    let renamed = handle(
        &host,
        &request("rename_set", json!({ "set_id": set_id, "name": "B" })),
    )
    .expect("переименование");
    assert_eq!(parse(&renamed)["set"]["name"], "B");
    assert!(handle(
        &host,
        &request("rename_set", json!({ "set_id": set_id, "name": " " }))
    )
    .is_err());
    assert!(handle(
        &host,
        &request("rename_set", json!({ "set_id": "ns-missing", "name": "C" }))
    )
    .is_err());

    handle(&host, &request("delete_set", json!({ "set_id": set_id }))).expect("удаление");
    let listed =
        handle(&host, &request("list_sets", json!({ "book_key": "lib/a" }))).expect("список");
    assert!(parse(&listed)["sets"]
        .as_array()
        .expect("наборы")
        .is_empty());
}

#[test]
fn add_note_returns_anchor_and_metadata() {
    let host = FakeHost::default();
    let set_id = create(&host, "lib/a", "A");
    let output = handle(
        &host,
        &request(
            "add_note",
            json!({
                "set_id": set_id,
                "note": {
                    "anchor": "epubcfi(/6/4)",
                    "quote": "цитата",
                    "chapter": "Глава 1",
                    "color": "green",
                    "percent": 7.5,
                    "text": "мысль"
                }
            }),
        ),
    )
    .expect("заметка");
    let note = &parse(&output)["note"];
    assert_eq!(note["anchor"], "epubcfi(/6/4)");
    assert_eq!(note["quote"], "цитата");
    assert_eq!(note["chapter"], "Глава 1");
    assert_eq!(note["color"], "green");
    assert_eq!(note["percent"], 7.5);
    assert_eq!(note["text"], "мысль");
    assert!(
        note["id"]
            .as_str()
            .expect("идентификатор")
            .starts_with("note-"),
        "новый идентификатор заметки"
    );
    assert_eq!(note["created_at_millis"], 1_000);

    let events = host.events.borrow();
    assert_eq!(events.len(), 2, "создание набора и добавление заметки");
    assert_eq!(events[1].0, "notes:changed");
}

#[test]
fn update_and_delete_note() {
    let host = FakeHost::default();
    let set_id = create(&host, "lib/a", "A");
    let added = handle(
        &host,
        &request(
            "add_note",
            json!({ "set_id": set_id, "note": { "text": "старый", "quote": "ц" } }),
        ),
    )
    .expect("заметка");
    let note_id = parse(&added)["note"]["id"]
        .as_str()
        .expect("идентификатор")
        .to_string();

    let updated = handle(
        &host,
        &request(
            "update_note",
            json!({
                "set_id": set_id,
                "note_id": note_id,
                "patch": { "text": "новый", "color": "blue" }
            }),
        ),
    )
    .expect("изменение");
    assert_eq!(parse(&updated)["note"]["text"], "новый");
    assert_eq!(parse(&updated)["note"]["color"], "blue");
    assert_eq!(
        parse(&updated)["note"]["quote"],
        "ц",
        "непереданное поле сохранено"
    );

    let defaulted = handle(
        &host,
        &request(
            "add_note",
            json!({ "set_id": set_id, "note": { "text": "без цвета", "quote": "ц2" } }),
        ),
    )
    .expect("заметка по умолчанию");
    assert_eq!(
        parse(&defaulted)["note"]["color"],
        "yellow",
        "цвет по умолчанию"
    );
    let defaulted_id = parse(&defaulted)["note"]["id"]
        .as_str()
        .expect("идентификатор")
        .to_string();
    handle(
        &host,
        &request(
            "delete_note",
            json!({ "set_id": set_id, "note_id": defaulted_id }),
        ),
    )
    .expect("удаление заметки по умолчанию");

    handle(
        &host,
        &request(
            "delete_note",
            json!({ "set_id": set_id, "note_id": note_id }),
        ),
    )
    .expect("удаление");
    let got = handle(&host, &request("get_set", json!({ "set_id": set_id }))).expect("набор");
    assert!(parse(&got)["set"]["notes"]
        .as_array()
        .expect("заметки")
        .is_empty());
}

#[test]
fn title_and_comment_pass_through_operations() {
    let host = FakeHost::default();
    let set_id = create(&host, "lib/a", "A");
    let added = handle(
        &host,
        &request(
            "add_note",
            json!({
                "set_id": set_id,
                "note": { "quote": "ц", "title": "Идея", "comment": "Разобрать" }
            }),
        ),
    )
    .expect("заметка");
    assert_eq!(parse(&added)["note"]["title"], "Идея");
    assert_eq!(parse(&added)["note"]["comment"], "Разобрать");
    let note_id = parse(&added)["note"]["id"]
        .as_str()
        .expect("идентификатор")
        .to_string();

    let updated = handle(
        &host,
        &request(
            "update_note",
            json!({
                "set_id": set_id,
                "note_id": note_id,
                "patch": { "title": "Итог", "comment": "" }
            }),
        ),
    )
    .expect("изменение");
    assert_eq!(parse(&updated)["note"]["title"], "Итог");
    assert_eq!(
        parse(&updated)["note"]["comment"],
        "",
        "пустой комментарий допустим"
    );
}

#[test]
fn note_operations_reject_unknown_set() {
    let host = FakeHost::default();
    assert!(handle(
        &host,
        &request(
            "add_note",
            json!({ "set_id": "ns-x", "note": { "text": "т" } })
        )
    )
    .is_err());
    assert!(handle(
        &host,
        &request(
            "update_note",
            json!({ "set_id": "ns-x", "note_id": "note-1", "patch": { "text": "т" } })
        )
    )
    .is_err());
    assert!(handle(
        &host,
        &request(
            "delete_note",
            json!({ "set_id": "ns-x", "note_id": "note-1" })
        )
    )
    .is_err());
}

#[test]
fn add_note_accepts_type_shape_and_geometry() {
    let host = FakeHost::default();
    let set_id = create(&host, "lib/a", "A");
    let output = handle(
        &host,
        &request(
            "add_note",
            json!({
                "set_id": set_id,
                "note": {
                    "type": "shape",
                    "shape": "ellipse",
                    "geometry": "{\"x\":0.1,\"y\":0.2}",
                    "color": "purple"
                }
            }),
        ),
    )
    .expect("фигура");
    let note = &parse(&output)["note"];
    assert_eq!(note["type"], "shape");
    assert_eq!(note["shape"], "ellipse");
    assert_eq!(note["geometry"], "{\"x\":0.1,\"y\":0.2}");
    assert_eq!(note["color"], "purple");

    let defaulted = handle(
        &host,
        &request(
            "add_note",
            json!({ "set_id": set_id, "note": { "text": "карточка" } }),
        ),
    )
    .expect("заметка по умолчанию");
    assert_eq!(
        parse(&defaulted)["note"]["type"],
        "quote",
        "без типа — цитата"
    );
}

#[test]
fn update_note_patches_type_and_geometry() {
    let host = FakeHost::default();
    let set_id = create(&host, "lib/a", "A");
    let added = handle(
        &host,
        &request(
            "add_note",
            json!({ "set_id": set_id, "note": { "text": "ц" } }),
        ),
    )
    .expect("заметка");
    let note_id = parse(&added)["note"]["id"]
        .as_str()
        .expect("идентификатор")
        .to_string();

    let updated = handle(
        &host,
        &request(
            "update_note",
            json!({
                "set_id": set_id,
                "note_id": note_id,
                "patch": { "type": "text", "text": "новая мысль", "geometry": "g2" }
            }),
        ),
    )
    .expect("изменение");
    assert_eq!(parse(&updated)["note"]["type"], "text");
    assert_eq!(parse(&updated)["note"]["text"], "новая мысль");
    assert_eq!(parse(&updated)["note"]["geometry"], "g2");
}

#[test]
fn state_survives_reload() {
    let host = FakeHost::default();
    let set_id = create(&host, "lib/a", "A");
    handle(
        &host,
        &request(
            "add_note",
            json!({ "set_id": set_id, "note": { "anchor": "cfi", "text": "заметка" } }),
        ),
    )
    .expect("заметка");

    let stored = host.state.borrow().clone().expect("состояние записано");
    let state: NotesState = serde_json::from_str(&stored).expect("состояние парсится");
    assert_eq!(state.sets().len(), 1);
    assert_eq!(state.find(&set_id).expect("набор").notes.len(), 1);
}

#[test]
fn active_set_is_returned_and_persisted_without_event() {
    let host = FakeHost::default();
    let first = create(&host, "lib/a", "A");
    let second = create(&host, "lib/a", "B");

    // Создание набора делает его активным.
    let listed =
        handle(&host, &request("list_sets", json!({ "book_key": "lib/a" }))).expect("список");
    assert_eq!(parse(&listed)["active_set_id"], second.as_str());

    let events_before = host.events.borrow().len();
    handle(
        &host,
        &request(
            "set_active",
            json!({ "book_key": "lib/a", "set_id": first }),
        ),
    )
    .expect("выбор");
    assert_eq!(
        host.events.borrow().len(),
        events_before,
        "выбор набора не публикует событие"
    );

    let listed =
        handle(&host, &request("list_sets", json!({ "book_key": "lib/a" }))).expect("список");
    assert_eq!(parse(&listed)["active_set_id"], first.as_str());
}

#[test]
fn set_active_rejects_foreign_set() {
    let host = FakeHost::default();
    let _ = create(&host, "lib/a", "A");
    let foreign = create(&host, "lib/b", "B");
    assert!(handle(
        &host,
        &request(
            "set_active",
            json!({ "book_key": "lib/a", "set_id": foreign })
        )
    )
    .is_err());
}

#[test]
fn export_set_documents_book_description_without_path() {
    let host = FakeHost::default();
    let set_id = create(&host, "/home/отправитель/Книга.epub", "Мой набор");
    handle(
        &host,
        &request(
            "add_note",
            json!({ "set_id": set_id, "note": { "text": "мысль", "quote": "цитата" } }),
        ),
    )
    .expect("заметка");

    let events_before = host.events.borrow().len();
    let output = handle(
        &host,
        &request(
            "export_set",
            json!({ "set_id": set_id, "book_name": "Книга.epub" }),
        ),
    )
    .expect("экспорт набора");
    let parsed = parse(&output);
    assert_eq!(parsed["file_name"], "Мой-набор.notes.json");
    let document_text = parsed["document"].as_str().expect("текст документа");
    let document: serde_json::Value =
        serde_json::from_str(document_text).expect("документ разбирается");
    assert_eq!(document["format"], "context.notes-set");
    assert_eq!(document["version"], 1);
    assert_eq!(document["book"]["name"], "Книга.epub");
    assert_eq!(document["set"]["name"], "Мой набор");
    assert_eq!(document["set"]["notes"][0]["text"], "мысль");
    // Путь книги — принадлежность хранилища отправителя, а не книги.
    assert!(
        !document_text.contains("/home/отправитель"),
        "путь книги не попадает в файл"
    );
    // Экспорт не меняет состояние и не публикует событие.
    assert_eq!(
        host.events.borrow().len(),
        events_before,
        "событие не опубликовано"
    );
}

#[test]
fn export_set_rejects_unknown_set() {
    let host = FakeHost::default();
    assert!(handle(
        &host,
        &request("export_set", json!({ "set_id": "ns-none" }))
    )
    .is_err());
}

#[test]
fn inspect_import_returns_set_and_book_without_changes() {
    let host = FakeHost::with_import_file(&import_document());
    let output = handle(
        &host,
        &request("inspect_import", json!({ "path": IMPORT_PATH })),
    )
    .expect("просмотр файла");
    let parsed = parse(&output);
    assert_eq!(parsed["set"]["name"], "Чужой набор");
    assert_eq!(parsed["set"]["note_count"], 1);
    assert_eq!(parsed["book"]["name"], "Чужая книга.epub");
    assert_eq!(parsed["book"]["title"], "Чужая книга");
    assert!(host.state.borrow().is_none(), "состояние не изменилось");
    assert!(host.events.borrow().is_empty(), "событие не опубликовано");
}

#[test]
fn import_set_binds_set_to_chosen_book() {
    let host = FakeHost::with_import_file(&import_document());
    let output = handle(
        &host,
        &request(
            "import_set",
            json!({
                "path": IMPORT_PATH,
                "book_key": "/моя/библиотека/Чужая книга.epub",
                "book_title": "Чужая книга",
            }),
        ),
    )
    .expect("импорт набора");
    let parsed = parse(&output);
    let set = &parsed["set"];
    assert_eq!(set["name"], "Чужой набор");
    // Ключ книги — локальный, выбранный при импорте, а не путь отправителя.
    assert_eq!(set["book_key"], "/моя/библиотека/Чужая книга.epub");
    assert_eq!(set["book_title"], "Чужая книга");
    assert_eq!(set["created_at_millis"], 42, "время создания из файла");
    let set_id = set["id"].as_str().expect("идентификатор набора");
    assert!(set_id.starts_with("ns-"), "новый идентификатор набора");
    let note = &set["notes"][0];
    assert!(note["id"]
        .as_str()
        .expect("идентификатор заметки")
        .starts_with("note-"));
    assert_ne!(note["id"], "note-source");
    assert_eq!(note["text"], "текст");
    assert_eq!(note["quote"], "цитата источника");
    assert_eq!(note["page"], 12);
    assert_eq!(note["created_at_millis"], 43);

    let stored = host.state.borrow().clone().expect("состояние записано");
    let state: NotesState = serde_json::from_str(&stored).expect("состояние парсится");
    assert!(state.find(set_id).is_some(), "набор в состоянии");
    let events = host.events.borrow();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].0, "notes:changed");
    assert_eq!(
        parse(&events[0].1)["book_key"],
        "/моя/библиотека/Чужая книга.epub"
    );
}

#[test]
fn import_set_takes_book_title_from_file_when_not_chosen() {
    let host = FakeHost::with_import_file(&import_document());
    let output = handle(
        &host,
        &request(
            "import_set",
            json!({ "path": IMPORT_PATH, "book_key": "/моя/книга.epub" }),
        ),
    )
    .expect("импорт набора");
    assert_eq!(parse(&output)["set"]["book_title"], "Чужая книга");
}

#[test]
fn import_set_accepts_same_file_twice() {
    let host = FakeHost::with_import_file(&import_document());
    let import = || {
        parse(
            &handle(
                &host,
                &request(
                    "import_set",
                    json!({ "path": IMPORT_PATH, "book_key": "lib/b" }),
                ),
            )
            .expect("импорт набора"),
        )
    };
    let first = import();
    let second = import();
    assert_ne!(first["set"]["id"], second["set"]["id"]);
    assert_ne!(
        first["set"]["notes"][0]["id"],
        second["set"]["notes"][0]["id"]
    );
}

#[test]
fn import_set_rejects_missing_file_and_broken_document() {
    let empty = FakeHost::default();
    assert!(handle(
        &empty,
        &request(
            "import_set",
            json!({ "path": IMPORT_PATH, "book_key": "lib/b" })
        )
    )
    .is_err());
    assert!(handle(
        &empty,
        &request("import_set", json!({ "book_key": "lib/b" }))
    )
    .is_err());
    assert!(handle(
        &empty,
        &request("inspect_import", json!({ "path": IMPORT_PATH }))
    )
    .is_err());

    let broken = FakeHost::with_import_file("не JSON");
    assert!(handle(
        &broken,
        &request(
            "import_set",
            json!({ "path": IMPORT_PATH, "book_key": "lib/b" })
        )
    )
    .is_err());
}

#[test]
fn import_set_without_book_keeps_set_and_hint() {
    let host = FakeHost::with_import_file(&import_document());
    let output = handle(
        &host,
        &request("import_set", json!({ "path": IMPORT_PATH })),
    )
    .expect("набор принимается и без книги");
    let set = &parse(&output)["set"];
    assert_eq!(set["book_key"], "", "книга не выбрана");
    // Подсказка, какую книгу указать: название из файла.
    assert_eq!(set["book_title"], "Чужая книга");
    assert_eq!(set["notes"].as_array().expect("заметки").len(), 1);
}

#[test]
fn bind_set_links_existing_set_to_book() {
    let host = FakeHost::with_import_file(&import_document());
    let imported = parse(
        &handle(
            &host,
            &request("import_set", json!({ "path": IMPORT_PATH })),
        )
        .expect("импорт"),
    );
    let set_id = imported["set"]["id"]
        .as_str()
        .expect("идентификатор набора");
    let events_before = host.events.borrow().len();

    let output = handle(
        &host,
        &request(
            "bind_set",
            json!({
                "set_id": set_id,
                "book_key": "/моя/библиотека/Книга.epub",
                "book_title": "Моя книга",
            }),
        ),
    )
    .expect("привязка набора");
    let set = &parse(&output)["set"];
    assert_eq!(set["book_key"], "/моя/библиотека/Книга.epub");
    assert_eq!(set["book_title"], "Моя книга");
    assert_eq!(
        set["notes"].as_array().expect("заметки").len(),
        1,
        "заметки целы"
    );
    // Привязка объявляется событием: реестр перечитывает набор.
    let events = host.events.borrow();
    assert_eq!(events.len(), events_before + 1);
    assert_eq!(events.last().expect("событие").0, "notes:changed");
    assert_eq!(
        parse(&events.last().expect("событие").1)["book_key"],
        "/моя/библиотека/Книга.epub"
    );
}

#[test]
fn bind_set_rejects_unknown_set_and_empty_book() {
    let host = FakeHost::default();
    assert!(handle(
        &host,
        &request(
            "bind_set",
            json!({ "set_id": "ns-none", "book_key": "lib/b" })
        )
    )
    .is_err());

    let set_id = create(&host, "lib/a", "A");
    let error = handle(
        &host,
        &request("bind_set", json!({ "set_id": set_id, "book_key": "   " })),
    )
    .expect_err("пустая книга отклонена");
    assert!(error.contains("не указана книга"), "{error}");
}

#[test]
fn import_set_rejects_document_without_name() {
    let host = FakeHost::with_import_file(&json!({ "set": { "notes": [] } }).to_string());
    let error = handle(
        &host,
        &request(
            "import_set",
            json!({ "path": IMPORT_PATH, "book_key": "lib/b" }),
        ),
    )
    .expect_err("набор без имени отклонён");
    assert!(error.contains("нет имени набора"), "{error}");
}

/// Документ импорта с одной заметкой: книга описана, пути в файле нет.
fn import_document() -> String {
    json!({
        "format": "context.notes-set",
        "version": 1,
        "exported_at_millis": 900,
        "book": { "name": "Чужая книга.epub", "title": "Чужая книга" },
        "set": {
            "name": "Чужой набор",
            "created_at_millis": 42,
            "notes": [{
                "id": "note-source",
                "type": "text",
                "anchor": "cfi",
                "quote": "цитата источника",
                "chapter": "Глава 1",
                "title": "Мысль",
                "comment": "комментарий",
                "color": "blue",
                "percent": 0.5,
                "page": 12,
                "text": "текст",
                "shape": "line",
                "geometry": "",
                "created_at_millis": 43,
                "updated_at_millis": 44
            }]
        }
    })
    .to_string()
}
