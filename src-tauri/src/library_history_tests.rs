use super::*;
use crate::plugin::SourceProvider;
use crate::test_util;

/// Идентификатор провайдера, не участвующий в переименованиях.
const PROVIDER: &str = "a692624f-1fa0-49a2-9015-9cb7361f9d47";
/// Человекочитаемое имя провайдера.
const PROVIDER_NAME: &str = "library";

/// Доступный провайдер тестового source-плагина.
fn provider() -> SourceProvider {
    SourceProvider {
        id: PROVIDER.to_string(),
        name: PROVIDER_NAME.to_string(),
    }
}

#[test]
fn remembers_and_lists_entry() {
    let root = test_util::test_root("history-remember");
    let library = root.join("lib");
    std::fs::create_dir_all(&library).expect("библиотека");

    remember(&root, library.to_str().unwrap(), PROVIDER).expect("запись");
    let entries = list(&root, &[provider()], &[]).expect("список");

    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].provider, PROVIDER);
    assert_eq!(entries[0].provider_name, PROVIDER_NAME);
    assert!(entries[0].available);
    test_util::cleanup(&root);
}

#[test]
fn hides_records_of_absent_providers() {
    let root = test_util::test_root("history-filter");
    let library = root.join("lib");
    std::fs::create_dir_all(&library).expect("библиотека");
    remember(&root, library.to_str().unwrap(), PROVIDER).expect("запись");

    let other = SourceProvider {
        id: "b0000000-0000-4000-8000-000000000001".to_string(),
        name: "other".to_string(),
    };
    let hidden = list(&root, &[other], &[]).expect("без провайдера");
    assert!(hidden.is_empty(), "записи отсутствующего провайдера скрыты");

    let visible = list(&root, &[provider()], &[]).expect("снова провайдер");
    assert_eq!(visible.len(), 1, "запись не потеряна и вернулась");
    test_util::cleanup(&root);
}

#[test]
fn hides_records_of_disabled_providers() {
    let root = test_util::test_root("history-disabled");
    let library = root.join("lib");
    std::fs::create_dir_all(&library).expect("библиотека");
    remember(&root, library.to_str().unwrap(), PROVIDER).expect("запись");

    let available = vec![provider()];
    let hidden = list(&root, &available, &[PROVIDER.to_string()]).expect("отключён");
    assert!(hidden.is_empty(), "записи отключённого провайдера скрыты");

    let visible = list(&root, &available, &[]).expect("включён");
    assert_eq!(visible.len(), 1, "после включения запись вернулась");
    test_util::cleanup(&root);
}

#[test]
fn marks_unavailable_library() {
    let root = test_util::test_root("history-availability");
    let missing = root.join("gone");

    remember(&root, missing.to_str().unwrap(), PROVIDER).expect("запись");
    let entries = list(&root, &[provider()], &[]).expect("список");

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

    remember(&root, first.to_str().unwrap(), PROVIDER).expect("первая");
    remember(&root, second.to_str().unwrap(), PROVIDER).expect("вторая");
    remember(&root, first.to_str().unwrap(), PROVIDER).expect("повтор");

    let entries = list(&root, &[provider()], &[]).expect("список");
    assert_eq!(entries.len(), 2, "без дублирования");
    assert_eq!(entries[0].path, first.to_str().unwrap(), "повтор наверху");
    test_util::cleanup(&root);
}

#[test]
fn forget_removes_record() {
    let root = test_util::test_root("history-forget");
    let library = root.join("lib");
    std::fs::create_dir_all(&library).expect("библиотека");
    remember(&root, library.to_str().unwrap(), PROVIDER).expect("запись");

    forget(&root, library.to_str().unwrap()).expect("удаление");
    let entries = list(&root, &[provider()], &[]).expect("список");

    assert!(entries.is_empty());
    test_util::cleanup(&root);
}
