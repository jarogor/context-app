use super::PluginSession;
use crate::test_util;
use std::path::PathBuf;

#[test]
fn plugin_directories_follow_priority() {
    let root = PathBuf::from("/library");
    let bundled = PathBuf::from("/bundled");
    let user = PathBuf::from("/user");
    let development = PathBuf::from("/development");

    let directories =
        super::plugin_directories(&root, &bundled, Some(&user), Some(development.clone()));
    assert_eq!(
        directories[0],
        root.join("plugins"),
        "плагины библиотеки первые"
    );
    assert_eq!(directories[1], user, "затем пользовательский каталог");
    assert_eq!(
        directories[2], development,
        "затем ресурсы рабочей копии (свежая сборка)"
    );
    assert_eq!(directories[3], bundled, "поставляемые ресурсы последние");
}

#[test]
fn plugin_directories_without_user_catalog() {
    let root = PathBuf::from("/library");
    let bundled = PathBuf::from("/bundled");

    let directories = super::plugin_directories(&root, &bundled, None, None);
    assert_eq!(directories[0], root.join("plugins"));
    assert_eq!(directories[1], bundled);
}

#[test]
fn pick_best_prefers_higher_priority() {
    let candidates = vec![("books-source".to_string(), 1), ("calibre".to_string(), 10)];

    assert_eq!(super::pick_best(candidates), Some("calibre".to_string()));
}

#[test]
fn pick_best_keeps_first_on_tie() {
    let candidates = vec![("a".to_string(), 5), ("b".to_string(), 5)];

    assert_eq!(super::pick_best(candidates), Some("a".to_string()));
}

#[test]
fn pick_best_is_none_for_empty_candidates() {
    assert_eq!(super::pick_best(Vec::new()), None);
}

#[test]
fn writable_root_is_created_before_plugin_configuration() {
    let parent = test_util::test_root("plugin-session-writable-root");
    let root = parent.join("nested").join("runtime-root");
    let bundled = parent.join("plugins");
    let mut session = PluginSession::idle(PathBuf::from("."), bundled);

    session
        .configure(&root, "test-plugin".to_string(), true, parent.join("state"))
        .expect("настройка writable plugin root");

    assert!(root.is_dir(), "writable root создан до настройки sandbox");
    assert_eq!(session.root(), root);
    test_util::cleanup(&parent);
}

#[test]
fn relative_storage_root_is_resolved_from_project_root() {
    let parent = test_util::test_root("plugin-session-relative-storage");
    let root = parent.join("root");
    let mut session = PluginSession::idle(PathBuf::from("."), parent.join("plugins"));

    let result = session.configure(
        &root,
        "test-plugin".to_string(),
        true,
        PathBuf::from("dev_data/app-state"),
    );

    assert!(
        result.is_ok(),
        "относительный storage root разрешён от корня проекта"
    );
    test_util::cleanup(&parent);
}

#[test]
fn select_source_warns_on_missing_path() {
    let parent = test_util::test_root("plugin-session-missing-path");
    let missing = parent.join("no-such-library");
    let mut session = PluginSession::idle(PathBuf::from("."), parent.join("plugins"));
    // Предупреждение пишется в файл диагностики: это техническая запись, она
    // нужна разбору сбоя, а не ленте пользователя.
    crate::plugin::diagnostics::init(&parent);

    let result = session.select_source(&missing, false, parent.join("state"));

    assert!(result.is_err(), "отсутствующий путь отклоняется");
    let content = crate::plugin::diagnostics::read().unwrap_or_default();
    assert!(
        content.contains("WARN"),
        "недоступная библиотека даёт предупреждение: {content}"
    );
    test_util::cleanup(&parent);
}

/// Раскладка generic-библиотеки для проверки переключения источника.
fn write_generic_library(root: &std::path::Path, title: &str) {
    std::fs::create_dir_all(root).expect("корень generic-библиотеки");
    std::fs::write(root.join(format!("{title}.pdf")), "pdf").expect("книга");
}

/// Раскладка Calibre для проверки переключения источника.
fn write_calibre_library(root: &std::path::Path) {
    let book = root.join("Автор").join("Книга");
    std::fs::create_dir_all(&book).expect("папка книги");
    std::fs::write(book.join("book.epub"), "epub").expect("книга");
    std::fs::write(
        book.join("metadata.opf"),
        "<?xml version='1.0'?><package xmlns:dc=\"http://purl.org/dc/elements/1.1/\"><metadata><dc:title>Книга Calibre</dc:title><dc:creator>Автор</dc:creator></metadata></package>",
    )
    .expect("metadata.opf");
    std::fs::write(root.join("metadata.db"), "db").expect("metadata.db");
}

#[test]
fn switching_between_generic_and_calibre_uses_new_root() {
    let parent = test_util::test_root("plugin-session-switch");
    let generic_root = parent.join("generic");
    let calibre_root = parent.join("calibre");
    let storage = parent.join("state");
    write_generic_library(&generic_root, "GenericBook");
    write_calibre_library(&calibre_root);
    let bundled = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("plugins");
    let mut session = PluginSession::idle(PathBuf::from("."), bundled);

    // Первая библиотека: generic-источник.
    let provider = session
        .select_source(&generic_root, false, &storage)
        .expect("выбор generic-источника");
    assert_eq!(
        provider, "a692624f-1fa0-49a2-9015-9cb7361f9d47",
        "выбран generic-источник"
    );
    let generic_catalog = session
        .invoke(
            "open",
            serde_json::json!({ "mode": "external", "path": generic_root }),
        )
        .expect("открытие generic-библиотеки");
    assert!(
        generic_catalog.contains("GenericBook"),
        "каталог generic-библиотеки содержит её книгу"
    );

    // Вторая библиотека: Calibre; каталог не должен содержать книги первой.
    let provider = session
        .select_source(&calibre_root, false, &storage)
        .expect("выбор Calibre");
    assert_eq!(
        provider, "f7c8b139-887f-4a2f-84e8-fdcc89635a79",
        "выбран источник Calibre"
    );
    let calibre_catalog = session
        .invoke(
            "open",
            serde_json::json!({ "mode": "external", "path": calibre_root }),
        )
        .expect("открытие библиотеки Calibre");
    assert!(
        calibre_catalog.contains("Книга Calibre"),
        "каталог Calibre содержит её книгу"
    );
    assert!(
        !calibre_catalog.contains("GenericBook"),
        "каталог Calibre не содержит книг предыдущей библиотеки"
    );

    test_util::cleanup(&parent);
}
