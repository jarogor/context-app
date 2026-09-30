use super::*;
use crate::test_util;

/// Вкладка тестового рабочего места.
fn tab(id: &str, path: &str, zoom: u32, position: f64) -> WorkspaceTab {
    WorkspaceTab {
        id: id.to_string(),
        path: path.to_string(),
        title: format!("Книга {path}"),
        format: "epub".to_string(),
        zoom,
        position,
        mode: "scroll".to_string(),
    }
}

/// Рабочее место с одной вкладкой.
fn workspace(id: &str, name: &str) -> WorkspaceRecord {
    WorkspaceRecord {
        id: id.to_string(),
        name: name.to_string(),
        created_at_millis: 1_700_000_000_000,
        tabs: vec![tab("t1", "book-1", 120, 42.5)],
        active_tab_id: Some("t1".to_string()),
    }
}

#[test]
fn missing_file_loads_empty_registry() {
    let root = test_util::test_root("workspaces-missing");

    let file = load(&root).expect("загрузка");

    assert!(file.workspaces.is_empty());
    assert_eq!(file.active_workspace_id, None);
    test_util::cleanup(&root);
}

#[test]
fn saves_and_loads_registry() {
    let root = test_util::test_root("workspaces-roundtrip");
    let file = WorkspacesFile {
        workspaces: vec![
            workspace("ws-1", "Исследование"),
            workspace("ws-2", "Второе"),
        ],
        active_workspace_id: Some("ws-2".to_string()),
    };

    save(&root, &file).expect("сохранение");
    let loaded = load(&root).expect("загрузка");

    assert_eq!(loaded, file);
    test_util::cleanup(&root);
}

#[test]
fn keeps_workspaces_tabs_independent() {
    let root = test_util::test_root("workspaces-independent");
    let mut first = workspace("ws-1", "Первое");
    first.tabs = vec![
        tab("t1", "book-1", 100, 10.0),
        tab("t2", "book-1", 160, 80.0),
    ];
    let second = workspace("ws-2", "Второе");
    let file = WorkspacesFile {
        workspaces: vec![first, second],
        active_workspace_id: Some("ws-1".to_string()),
    };

    save(&root, &file).expect("сохранение");
    let loaded = load(&root).expect("загрузка");

    assert_eq!(loaded.workspaces[0].tabs.len(), 2);
    assert_eq!(loaded.workspaces[0].tabs[1].zoom, 160);
    assert_eq!(loaded.workspaces[1].tabs.len(), 1);
    assert_eq!(loaded.workspaces[1].tabs[0].zoom, 120);
    test_util::cleanup(&root);
}

#[test]
fn defaults_missing_tab_fields() {
    let root = test_util::test_root("workspaces-defaults");
    std::fs::create_dir_all(&root).expect("каталог");
    std::fs::write(
        root.join("workspaces.json"),
        r#"{"workspaces":[{"id":"ws-1","name":"Первое","tabs":[{"id":"t1","path":"book.epub","title":"Книга"}]}]}"#,
    )
    .expect("файл");

    let file = load(&root).expect("загрузка");

    assert_eq!(file.workspaces[0].tabs[0].zoom, 100);
    assert_eq!(file.workspaces[0].tabs[0].position, 0.0);
    assert_eq!(file.workspaces[0].active_tab_id, None);
    assert_eq!(file.active_workspace_id, None);
    test_util::cleanup(&root);
}

#[test]
fn migrates_legacy_single_workspace() {
    let root = test_util::test_root("workspaces-migrate");
    std::fs::create_dir_all(&root).expect("каталог");
    std::fs::write(
        root.join("workspace.json"),
        r#"{"tabs":[{"id":"t1","book_id":"book-1","title":"Книга","zoom":140,"position":25.0}],"active_tab_id":"t1"}"#,
    )
    .expect("файл");

    let file = load(&root).expect("загрузка");

    assert_eq!(file.workspaces.len(), 1);
    assert_eq!(file.workspaces[0].id, DEFAULT_WORKSPACE_ID);
    assert_eq!(file.workspaces[0].name, DEFAULT_WORKSPACE_NAME);
    assert_eq!(file.workspaces[0].tabs[0].zoom, 140);
    assert_eq!(file.workspaces[0].active_tab_id.as_deref(), Some("t1"));
    assert_eq!(
        file.active_workspace_id.as_deref(),
        Some(DEFAULT_WORKSPACE_ID)
    );
    test_util::cleanup(&root);
}

#[test]
fn migration_is_idempotent_without_saving() {
    let root = test_util::test_root("workspaces-migrate-repeat");
    std::fs::create_dir_all(&root).expect("каталог");
    std::fs::write(
        root.join("workspace.json"),
        r#"{"tabs":[{"id":"t1","book_id":"book-1","title":"Книга"}],"active_tab_id":"t1"}"#,
    )
    .expect("файл");

    let first = load(&root).expect("первое чтение");
    let second = load(&root).expect("второе чтение");

    assert_eq!(first.workspaces.len(), 1);
    assert_eq!(first.workspaces[0].tabs.len(), 1);
    assert_eq!(second, first);
    assert!(root.join("workspace.json").exists());
    test_util::cleanup(&root);
}

#[test]
fn saved_registry_wins_over_legacy() {
    let root = test_util::test_root("workspaces-legacy-ignored");
    std::fs::create_dir_all(&root).expect("каталог");
    std::fs::write(
        root.join("workspace.json"),
        r#"{"tabs":[{"id":"t1","book_id":"book-1","title":"Старая"}],"active_tab_id":"t1"}"#,
    )
    .expect("файл");
    let file = WorkspacesFile {
        workspaces: vec![workspace("ws-2", "Новое")],
        active_workspace_id: Some("ws-2".to_string()),
    };
    save(&root, &file).expect("сохранение");

    let loaded = load(&root).expect("загрузка");

    assert_eq!(loaded.workspaces.len(), 1);
    assert_eq!(loaded.workspaces[0].id, "ws-2");
    test_util::cleanup(&root);
}
