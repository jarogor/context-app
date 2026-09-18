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
        "contract_version": 2,
        "name": "demo-plugin",
        "description": "Демонстрационный плагин",
        "module": "demo_plugin.wasm",
        "export": "invoke",
        "host_functions": ["log"]
      }"#,
    );

    let manifest = PluginManifest::load(&path).expect("парсинг манифеста");
    assert_eq!(
        manifest.contract_version,
        super::super::contract::CONTRACT_VERSION
    );
    assert_eq!(manifest.kind, PluginKind::Extension, "kind по умолчанию");
    assert_eq!(manifest.name, "demo-plugin");
    assert_eq!(manifest.module, "demo_plugin.wasm");
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
fn parses_source_kind_manifest() {
    let path = write_manifest(
        r#"{
        "contract_version": 2,
        "kind": "source",
        "name": "library-source",
        "description": "Поставщик библиотеки",
        "module": "library_plugin.wasm",
        "export": "invoke",
        "host_functions": ["log", "fs_list_dir", "fs_read_text"]
      }"#,
    );

    let manifest = PluginManifest::load(&path).expect("парсинг манифеста");
    assert_eq!(manifest.kind, PluginKind::Source);
    assert_eq!(manifest.kind.as_str(), "source");

    let dir = path.parent().expect("директория");
    manifest
        .validate(dir)
        .expect("валидный source-манифест принимается");
    fs::remove_dir_all(dir).expect("очистка");
}

#[test]
fn unknown_kind_is_rejected() {
    let path = write_manifest(
        r#"{
        "contract_version": 2,
        "kind": "obscure",
        "name": "plugin",
        "description": "x",
        "module": "p.wasm",
        "export": "invoke",
        "host_functions": []
      }"#,
    );

    let result = PluginManifest::load(&path);
    assert!(result.is_err(), "манифест с неизвестным kind отклоняется");

    let dir = path.parent().expect("директория");
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
fn missing_fields_are_rejected() {
    let path = write_manifest(
        r#"{
        "contract_version": 2,
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
