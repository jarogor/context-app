use super::*;
use crate::test_util;

#[test]
fn disable_then_enable_roundtrip() {
    let root = test_util::test_root("activation-roundtrip");

    set_enabled(&root, "calibre", false).expect("отключение");
    assert!(is_disabled(&root, "calibre").expect("проверка"));
    assert_eq!(load(&root).expect("загрузка"), ["calibre".to_string()]);

    set_enabled(&root, "calibre", true).expect("включение");
    assert!(!is_disabled(&root, "calibre").expect("проверка"));
    assert!(load(&root).expect("загрузка").is_empty());

    test_util::cleanup(&root);
}

#[test]
fn missing_file_is_empty() {
    let root = test_util::test_root("activation-missing");
    assert!(load(&root).expect("загрузка").is_empty());
    test_util::cleanup(&root);
}

#[test]
fn state_survives_reload() {
    let root = test_util::test_root("activation-persist");
    let disabled = vec!["demo".to_string(), "calibre".to_string()];

    save(&root, &disabled).expect("сохранение");
    let mut loaded = load(&root).expect("загрузка");
    loaded.sort();

    assert_eq!(loaded, vec!["calibre".to_string(), "demo".to_string()]);
    test_util::cleanup(&root);
}
