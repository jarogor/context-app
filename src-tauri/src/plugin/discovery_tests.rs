use std::path::Path;

use super::*;
use crate::test_util;

/// Идентификаторы плагинов, используемые в тестах.
const LIBRARY_ID: &str = "a692624f-1fa0-49a2-9015-9cb7361f9d47";
const CALIBRE_ID: &str = "f7c8b139-887f-4a2f-84e8-fdcc89635a79";
const SETTINGS_ID: &str = "69b39e5d-0c25-4cdb-8c3e-d3ba89147c24";
const DEMO_ID: &str = "e6ddd2e8-a62c-4350-b431-2bb4f2cb8d5c";

/// Создание директории плагина с манифестом заданной категории.
fn write_manifest(directory: &Path, id: &str, name: &str, kind: &str) {
    let plugin_dir = directory.join(name);
    std::fs::create_dir_all(&plugin_dir).expect("директория плагина");
    std::fs::write(
        plugin_dir.join(MANIFEST_FILE_NAME),
        format!(
            r#"{{"contract_version":1,"kind":"{kind}","id":"{id}","name":"{name}","description":"d","module":"p.wasm","export":"invoke","host_functions":[]}}"#
        ),
    )
    .expect("манифест");
}

#[test]
fn discovers_only_source_plugins() {
    let dir = test_util::test_root("plugin-discovery");
    write_manifest(&dir, LIBRARY_ID, "library", "source");
    write_manifest(&dir, CALIBRE_ID, "calibre", "source");
    write_manifest(&dir, SETTINGS_ID, "settings", "base");

    let providers = discover_source_plugins(std::slice::from_ref(&dir));

    assert_eq!(
        providers,
        vec![
            SourceProvider {
                id: LIBRARY_ID.to_string(),
                name: "library".to_string()
            },
            SourceProvider {
                id: CALIBRE_ID.to_string(),
                name: "calibre".to_string()
            },
        ]
    );
    test_util::cleanup(&dir);
}

#[test]
fn missing_directory_is_skipped() {
    let dir = test_util::test_root("plugin-discovery-missing");

    let providers = discover_source_plugins(&[dir.join("no-such-dir")]);

    assert!(providers.is_empty());
    test_util::cleanup(&dir);
}

#[test]
fn lists_disableable_with_flags() {
    let dir = test_util::test_root("plugin-discovery-list");
    let bundled = dir.join("bundled");
    let user = dir.join("user");
    std::fs::create_dir_all(&bundled).expect("bundled");
    std::fs::create_dir_all(&user).expect("user");
    write_manifest(&bundled, CALIBRE_ID, "calibre", "source");
    write_manifest(&bundled, SETTINGS_ID, "settings", "base");
    write_manifest(&user, DEMO_ID, "demo", "extension");

    let entries = list_disableable(
        &[bundled.clone(), user.clone()],
        Some(user.as_path()),
        &[CALIBRE_ID.to_string()],
    );

    let names = entries
        .iter()
        .map(|entry| entry.name.clone())
        .collect::<Vec<_>>();
    assert_eq!(names, vec!["demo", "calibre"], "базовые исключены");
    let calibre = entries.iter().find(|entry| entry.id == CALIBRE_ID).unwrap();
    assert_eq!(calibre.kind, "source");
    assert!(!calibre.enabled, "отключён по реестру");
    assert!(!calibre.removable, "поставляемый не удаляется");
    let demo = entries.iter().find(|entry| entry.id == DEMO_ID).unwrap();
    assert!(demo.enabled);
    assert!(demo.removable, "пользовательский удаляется");
    test_util::cleanup(&dir);
}

#[test]
fn sample_flag_survives_user_copy() {
    let dir = test_util::test_root("plugin-discovery-sample-copy");
    let bundled = dir.join("bundled");
    let user = dir.join("user");
    std::fs::create_dir_all(&bundled).expect("bundled");
    std::fs::create_dir_all(&user).expect("user");
    // Поставляемый образец и его пользовательская копия без признака образца.
    write_sample_manifest(&bundled, DEMO_ID, "demo", "extension");
    write_manifest(&user, DEMO_ID, "demo", "extension");

    let entries = list_disableable(&[user.clone(), bundled.clone()], Some(user.as_path()), &[]);

    assert_eq!(entries.len(), 1, "копии одного id схлопываются");
    assert!(
        entries[0].sample,
        "признак образца поставляемой копии сохранён"
    );
    test_util::cleanup(&dir);
}

/// Создание директории плагина с манифестом-образцом.
fn write_sample_manifest(directory: &Path, id: &str, name: &str, kind: &str) {
    let plugin_dir = directory.join(name);
    std::fs::create_dir_all(&plugin_dir).expect("директория плагина");
    std::fs::write(
        plugin_dir.join(MANIFEST_FILE_NAME),
        format!(
            r#"{{"contract_version":1,"kind":"{kind}","id":"{id}","name":"{name}","description":"d","module":"p.wasm","export":"invoke","host_functions":[],"sample":true}}"#
        ),
    )
    .expect("манифест");
}
