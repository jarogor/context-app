use super::*;
use crate::test_util;
use crate::update::models::UpdateSource;

#[test]
fn missing_file_gives_defaults() {
    let root = test_util::test_root("update-state-missing");
    let state = load(&root).expect("состояние по умолчанию");
    assert!(
        state.config.check_on_startup,
        "проверка при запуске включена"
    );
    assert!(state.config.source.is_none());
    test_util::cleanup(&root);
}

#[test]
fn saves_and_reads_config() {
    let root = test_util::test_root("update-state-save");
    let mut state = PersistedUpdate::with_source(Some(UpdateSource {
        kind: "file".to_string(),
        location: "/tmp/updates".to_string(),
    }));
    state.config.check_on_startup = false;
    save(&root, &state).expect("запись состояния");

    let loaded = load(&root).expect("чтение состояния");
    assert_eq!(loaded, state);
    test_util::cleanup(&root);
}

#[test]
fn skips_version_without_losing_source() {
    let root = test_util::test_root("update-state-skip");
    let state = PersistedUpdate::with_source(Some(UpdateSource {
        kind: "network".to_string(),
        location: "https://example.com/updates".to_string(),
    }));
    save(&root, &state).expect("запись состояния");

    let updated = skip_version(&root, "0.2.0").expect("пропуск версии");
    assert_eq!(updated.config.skipped_version.as_deref(), Some("0.2.0"));
    assert_eq!(updated.config.source, state.config.source);
    test_util::cleanup(&root);
}
