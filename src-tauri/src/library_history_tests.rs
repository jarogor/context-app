use super::*;
use crate::test_util;

#[test]
fn remembers_and_lists_entry() {
    let root = test_util::test_root("history-remember");
    let library = root.join("lib");
    std::fs::create_dir_all(&library).expect("библиотека");

    remember(&root, library.to_str().unwrap(), "calibre").expect("запись");
    let entries = list(&root, &["calibre".to_string()]).expect("список");

    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].provider, "calibre");
    assert!(entries[0].available);
    test_util::cleanup(&root);
}

#[test]
fn hides_records_of_absent_providers() {
    let root = test_util::test_root("history-filter");
    let library = root.join("lib");
    std::fs::create_dir_all(&library).expect("библиотека");
    remember(&root, library.to_str().unwrap(), "calibre").expect("запись");

    let hidden = list(&root, &["library".to_string()]).expect("без calibre");
    assert!(hidden.is_empty(), "записи отсутствующего провайдера скрыты");

    let visible = list(&root, &["calibre".to_string()]).expect("снова calibre");
    assert_eq!(visible.len(), 1, "запись не потеряна и вернулась");
    test_util::cleanup(&root);
}

#[test]
fn marks_unavailable_library() {
    let root = test_util::test_root("history-availability");
    let missing = root.join("gone");

    remember(&root, missing.to_str().unwrap(), "library").expect("запись");
    let entries = list(&root, &["library".to_string()]).expect("список");

    assert!(!entries[0].available);
    test_util::cleanup(&root);
}

#[test]
fn duplicate_path_moves_to_top_without_duplication() {
    let root = test_util::test_root("history-duplicate");
    let first = root.join("first");
    let second = root.join("second");
    std::fs::create_dir_all(&first).expect("первая");
    std::fs::create_dir_all(&second).expect("вторая");

    remember(&root, first.to_str().unwrap(), "library").expect("первая");
    remember(&root, second.to_str().unwrap(), "library").expect("вторая");
    remember(&root, first.to_str().unwrap(), "library").expect("повтор");

    let entries = list(&root, &["library".to_string()]).expect("список");
    assert_eq!(entries.len(), 2, "без дублирования");
    assert_eq!(entries[0].path, first.to_str().unwrap(), "повтор наверху");
    test_util::cleanup(&root);
}

#[test]
fn forget_removes_record() {
    let root = test_util::test_root("history-forget");
    let library = root.join("lib");
    std::fs::create_dir_all(&library).expect("библиотека");
    remember(&root, library.to_str().unwrap(), "library").expect("запись");

    forget(&root, library.to_str().unwrap()).expect("удаление");
    let entries = list(&root, &["library".to_string()]).expect("список");

    assert!(entries.is_empty());
    test_util::cleanup(&root);
}
