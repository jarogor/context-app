use super::*;
use crate::test_util;

#[test]
fn disable_then_enable_roundtrip() {
    let root = test_util::test_root("activation-roundtrip");

    set_enabled(&root, "f7c8b139-887f-4a2f-84e8-fdcc89635a79", false).expect("отключение");
    assert!(is_disabled(&root, "f7c8b139-887f-4a2f-84e8-fdcc89635a79").expect("проверка"));
    assert_eq!(
        load(&root).expect("загрузка"),
        ["f7c8b139-887f-4a2f-84e8-fdcc89635a79".to_string()]
    );

    set_enabled(&root, "f7c8b139-887f-4a2f-84e8-fdcc89635a79", true).expect("включение");
    assert!(!is_disabled(&root, "f7c8b139-887f-4a2f-84e8-fdcc89635a79").expect("проверка"));
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
    let demo = "e6ddd2e8-a62c-4350-b431-2bb4f2cb8d5c".to_string();
    let calibre = "f7c8b139-887f-4a2f-84e8-fdcc89635a79".to_string();
    let disabled = vec![demo.clone(), calibre.clone()];

    save(&root, &disabled).expect("сохранение");
    let mut loaded = load(&root).expect("загрузка");
    loaded.sort();

    let mut expected = vec![demo, calibre];
    expected.sort();
    assert_eq!(loaded, expected);
    test_util::cleanup(&root);
}
