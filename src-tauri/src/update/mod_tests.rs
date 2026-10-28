use super::*;
use crate::test_util;
use std::fs;

/// Запись файлового источника с индексом.
fn write_source(root: &Path, index: &str) {
    fs::create_dir_all(root).expect("каталог источника");
    fs::write(root.join(source::INDEX_FILE_NAME), index).expect("индекс");
}

#[test]
fn check_returns_newer_core_release() {
    let root = test_util::test_root("update-check-newer");
    let source_root = root.join("source");
    let platform = version::platform_key();
    write_source(
        &source_root,
        &format!(
            r#"{{"contract_version":1,"core":{{"version":"0.2.0","notes":"новое","platforms":{{"{platform}":{{"mode":"portable","location":"app.zip","sha256":"aa"}}}}}}}}"#
        ),
    );
    state::save(
        &root,
        &PersistedUpdate::with_source(Some(UpdateSource {
            kind: "file".to_string(),
            location: source_root.to_string_lossy().into_owned(),
        })),
    )
    .expect("состояние");

    let result = check(&root, "0.1.0").expect("проверка");
    let core = result.core.expect("доступное обновление");
    assert_eq!(core.version, "0.2.0");
    assert_eq!(core.notes, "новое");
    test_util::cleanup(&root);
}

#[test]
fn check_ignores_same_version() {
    let root = test_util::test_root("update-check-same");
    let source_root = root.join("source");
    let platform = version::platform_key();
    write_source(
        &source_root,
        &format!(
            r#"{{"contract_version":1,"core":{{"version":"0.1.0","platforms":{{"{platform}":{{"location":"app.zip"}}}}}}}}"#
        ),
    );
    state::save(
        &root,
        &PersistedUpdate::with_source(Some(UpdateSource {
            kind: "file".to_string(),
            location: source_root.to_string_lossy().into_owned(),
        })),
    )
    .expect("состояние");

    assert!(check(&root, "0.1.0").expect("проверка").core.is_none());
    test_util::cleanup(&root);
}

#[test]
fn skipped_version_is_not_offered() {
    let root = test_util::test_root("update-check-skipped");
    let source_root = root.join("source");
    let platform = version::platform_key();
    write_source(
        &source_root,
        &format!(
            r#"{{"contract_version":1,"core":{{"version":"0.2.0","platforms":{{"{platform}":{{"location":"app.zip"}}}}}}}}"#
        ),
    );
    let mut state = PersistedUpdate::with_source(Some(UpdateSource {
        kind: "file".to_string(),
        location: source_root.to_string_lossy().into_owned(),
    }));
    state.config.skipped_version = Some("0.2.0".to_string());
    state::save(&root, &state).expect("состояние");

    assert!(check(&root, "0.1.0").expect("проверка").core.is_none());
    test_util::cleanup(&root);
}

#[test]
fn missing_source_is_not_an_error() {
    let root = test_util::test_root("update-check-no-source");
    state::save(&root, &PersistedUpdate::default()).expect("состояние");

    let result = check(&root, "0.1.0").expect("проверка без источника");
    // Пустой источник заменяется значением по умолчанию, но запуск не падает.
    assert!(result.core.is_none());
    test_util::cleanup(&root);
}
