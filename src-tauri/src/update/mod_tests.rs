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
fn load_state_moves_root_source_to_nested_updates() {
    // Источник, указанный на корень данных, переводится на каталог обновлений
    // внутри него: в корне рядом лежат состояние, плагины и кеш, а индекс
    // обновлений живёт в собственном каталоге.
    let root = test_util::test_root("update-source-migrate");
    let data_root = root.join("dev-data");
    write_source(
        &data_root.join("updates"),
        r#"{"contract_version":1,"core":null}"#,
    );
    state::save(
        &root,
        &PersistedUpdate::with_source(Some(UpdateSource {
            kind: "file".to_string(),
            location: data_root.to_string_lossy().into_owned(),
        })),
    )
    .expect("состояние");

    let loaded = load_state(&root).expect("состояние обновлений");
    let source = loaded.config.source.expect("источник");
    assert_eq!(
        Path::new(&source.location),
        data_root.join("updates"),
        "источник переведён в подкаталог updates"
    );

    // Исправление сохраняется: следующий запуск читает уже верный путь.
    let again = load_state(&root).expect("повторное чтение");
    assert_eq!(
        Path::new(&again.config.source.expect("источник").location),
        data_root.join("updates")
    );
    test_util::cleanup(&root);
}

#[test]
fn load_state_keeps_source_with_own_index() {
    // Каталог, в котором индекс лежит на своём уровне, не подменяется: путь
    // выбран пользователем осознанно.
    let root = test_util::test_root("update-source-own-index");
    let source_root = root.join("my-updates");
    write_source(&source_root, r#"{"contract_version":1,"core":null}"#);
    write_source(
        &source_root.join("updates"),
        r#"{"contract_version":1,"core":null}"#,
    );
    state::save(
        &root,
        &PersistedUpdate::with_source(Some(UpdateSource {
            kind: "file".to_string(),
            location: source_root.to_string_lossy().into_owned(),
        })),
    )
    .expect("состояние");

    let loaded = load_state(&root).expect("состояние обновлений");
    assert_eq!(
        Path::new(&loaded.config.source.expect("источник").location),
        source_root
    );
    test_util::cleanup(&root);
}

#[test]
fn migrate_file_source_ignores_network_and_empty_dirs() {
    let network = UpdateSource {
        kind: "network".to_string(),
        location: "https://example.com/updates".to_string(),
    };
    assert!(migrate_file_source(&network).is_none());

    let root = test_util::test_root("update-source-empty");
    let empty = root.join("empty");
    fs::create_dir_all(&empty).expect("каталог");
    let file = UpdateSource {
        kind: "file".to_string(),
        location: empty.to_string_lossy().into_owned(),
    };
    assert!(migrate_file_source(&file).is_none());
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
