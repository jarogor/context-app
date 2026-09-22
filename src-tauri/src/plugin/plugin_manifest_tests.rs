use super::*;
use crate::test_util;
use std::fs;
use std::path::PathBuf;

/// Создание временной директории с манифестом.
fn write_manifest(content: &str) -> PathBuf {
    let dir = test_util::test_root("plugin-contract");
    let path = dir.join(super::super::contract::MANIFEST_FILE_NAME);
    fs::write(&path, content).expect("запись манифеста");
    path
}

#[test]
fn parses_valid_manifest() {
    let path = write_manifest(
        r#"{
        "contract_version": 1,
        "name": "demo",
        "description": "Демонстрационный плагин",
        "module": "demo.wasm",
        "export": "invoke",
        "host_functions": ["log"]
      }"#,
    );

    let manifest = PluginManifest::load(&path).expect("парсинг манифеста");
    assert_eq!(
        manifest.contract_version,
        super::super::contract::CONTRACT_VERSION
    );
    assert_eq!(
        manifest.kind,
        crate::plugin::PluginKind::Extension,
        "категория по умолчанию"
    );
    assert_eq!(manifest.name, "demo");
    assert_eq!(manifest.module, "demo.wasm");
    assert_eq!(manifest.export, super::super::contract::EXPORT_FUNCTION);
    assert_eq!(
        manifest.host_functions,
        vec![super::super::contract::HOST_LOG_FUNCTION.to_string()]
    );

    let dir = path.parent().expect("директория");
    manifest
        .validate(dir)
        .expect("валидный манифест принимается");
    fs::remove_dir_all(dir).expect("очистка");
}

#[test]
fn unknown_contract_version_is_rejected() {
    let path = write_manifest(
        r#"{
        "contract_version": 99,
        "name": "plugin",
        "description": "x",
        "module": "p.wasm",
        "export": "invoke",
        "host_functions": []
      }"#,
    );

    let manifest = PluginManifest::load(&path).expect("парсинг манифеста");
    let dir = path.parent().expect("директория");
    let result = manifest.validate(dir);
    assert!(result.is_err(), "неподдерживаемая версия отклоняется");
    assert!(
        matches!(
            result,
            Err(PluginError::UnsupportedContract { version: 99, .. })
        ),
        "сообщение об ошибке содержит версию"
    );

    fs::remove_dir_all(dir).expect("очистка");
}

#[test]
fn parses_plugin_capabilities() {
    let path = write_manifest(
        r#"{
        "contract_version": 1,
        "name": "rating",
        "description": "Рейтинг",
        "module": "rating.wasm",
        "export": "invoke",
        "host_functions": [],
        "provides": ["rating@1"],
        "requires": ["catalog.provider@1"]
      }"#,
    );

    let manifest = PluginManifest::load(&path).expect("парсинг capabilities");
    assert_eq!(manifest.provides, ["rating@1"]);
    assert_eq!(manifest.requires, ["catalog.provider@1"]);
    manifest
        .validate(path.parent().expect("директория"))
        .expect("capabilities валидны");
    fs::remove_dir_all(path.parent().expect("директория")).expect("очистка");
}

#[test]
fn parses_base_plugin_kind() {
    let path = write_manifest(
        r#"{
        "contract_version": 1,
        "kind": "base",
        "name": "notifications",
        "description": "Уведомления",
        "module": "notifications.wasm",
        "export": "invoke",
        "host_functions": ["emit_event"]
      }"#,
    );

    let manifest = PluginManifest::load(&path).expect("парсинг базового плагина");
    assert_eq!(manifest.kind, crate::plugin::PluginKind::Base);
    fs::remove_dir_all(path.parent().expect("директория")).expect("очистка");
}

#[test]
fn unknown_plugin_kind_is_rejected() {
    let path = write_manifest(
        r#"{
        "contract_version": 1,
        "kind": "unknown",
        "name": "plugin",
        "description": "x",
        "module": "p.wasm",
        "export": "invoke",
        "host_functions": []
      }"#,
    );

    let result = PluginManifest::load(&path);
    assert!(result.is_err(), "неизвестная категория отклоняется");
    fs::remove_dir_all(path.parent().expect("директория")).expect("очистка");
}

#[test]
fn missing_fields_are_rejected() {
    let path = write_manifest(
        r#"{
        "contract_version": 1,
        "name": "plugin"
      }"#,
    );

    let result = PluginManifest::load(&path);
    assert!(
        result.is_err(),
        "манифест без обязательных полей отклоняется"
    );

    let dir = path.parent().expect("директория");
    fs::remove_dir_all(dir).expect("очистка");
}
