use super::*;
use crate::test_util;

/// Вкладка тестового рабочего места.
fn tab(id: &str, book_id: &str, zoom: u32, position: f64) -> WorkspaceTab {
    WorkspaceTab {
        id: id.to_string(),
        book_id: book_id.to_string(),
        title: format!("Книга {book_id}"),
        format: "epub".to_string(),
        zoom,
        position,
        mode: "scroll".to_string(),
    }
}

#[test]
fn missing_file_loads_empty_workspace() {
    let root = test_util::test_root("workspace-missing");

    let state = load(&root).expect("загрузка");

    assert!(state.tabs.is_empty());
    assert_eq!(state.active_tab_id, None);
    test_util::cleanup(&root);
}

#[test]
fn saves_and_loads_state() {
    let root = test_util::test_root("workspace-roundtrip");
    let state = WorkspaceState {
        tabs: vec![tab("t1", "book-1", 120, 42.5)],
        active_tab_id: Some("t1".to_string()),
    };

    save(&root, &state).expect("сохранение");
    let loaded = load(&root).expect("загрузка");

    assert_eq!(loaded, state);
    test_util::cleanup(&root);
}

#[test]
fn keeps_tabs_of_same_book_independent() {
    let root = test_util::test_root("workspace-independent");
    let state = WorkspaceState {
        tabs: vec![
            tab("t1", "book-1", 100, 10.0),
            tab("t2", "book-1", 160, 80.0),
        ],
        active_tab_id: Some("t2".to_string()),
    };

    save(&root, &state).expect("сохранение");
    let loaded = load(&root).expect("загрузка");

    assert_eq!(loaded.tabs[0].zoom, 100);
    assert_eq!(loaded.tabs[1].zoom, 160);
    assert_eq!(loaded.tabs[0].position, 10.0);
    assert_eq!(loaded.tabs[1].position, 80.0);
    test_util::cleanup(&root);
}

#[test]
fn defaults_missing_fields() {
    let root = test_util::test_root("workspace-defaults");
    std::fs::create_dir_all(&root).expect("каталог");
    std::fs::write(
        root.join("workspace.json"),
        r#"{"tabs":[{"id":"t1","book_id":"book-1","title":"Книга"}]}"#,
    )
    .expect("файл");

    let state = load(&root).expect("загрузка");

    assert_eq!(state.tabs[0].zoom, 100);
    assert_eq!(state.tabs[0].position, 0.0);
    assert_eq!(state.active_tab_id, None);
    test_util::cleanup(&root);
}
