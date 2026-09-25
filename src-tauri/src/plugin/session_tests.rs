use super::PluginSession;
use crate::test_util;
use std::path::PathBuf;

#[test]
fn plugin_directories_follow_priority() {
    let root = PathBuf::from("/library");
    let bundled = PathBuf::from("/bundled");
    let user = PathBuf::from("/user");

    let directories = super::plugin_directories(&root, &bundled, Some(&user));
    assert_eq!(
        directories[0],
        root.join("plugins"),
        "плагины библиотеки первые"
    );
    assert_eq!(directories[1], user, "затем пользовательский каталог");
    assert_eq!(directories[2], bundled, "поставляемые ресурсы последние");
}

#[test]
fn plugin_directories_without_user_catalog() {
    let root = PathBuf::from("/library");
    let bundled = PathBuf::from("/bundled");

    let directories = super::plugin_directories(&root, &bundled, None);
    assert_eq!(directories[0], root.join("plugins"));
    assert_eq!(directories[1], bundled);
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
