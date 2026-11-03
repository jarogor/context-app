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
        "id": "11111111-1111-4111-8111-111111111111",
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
    assert_eq!(manifest.id, "11111111-1111-4111-8111-111111111111");
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
        "id": "22222222-2222-4222-8222-222222222222",
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
        "id": "33333333-3333-4333-8333-333333333333",
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
fn parses_framework_plugin_kind() {
    let path = write_manifest(
        r#"{
        "contract_version": 1,
        "level": "framework", "kind": "framework",
        "id": "44444444-4444-4444-8444-444444444444",
        "name": "settings",
        "description": "Настройки",
        "module": "settings.wasm",
        "export": "invoke",
        "host_functions": ["emit_event"]
      }"#,
    );

    let manifest = PluginManifest::load(&path).expect("парсинг базового плагина");
    assert_eq!(manifest.kind, crate::plugin::PluginKind::Framework);
    fs::remove_dir_all(path.parent().expect("директория")).expect("очистка");
}

#[test]
fn unknown_plugin_kind_is_rejected() {
    let path = write_manifest(
        r#"{
        "contract_version": 1,
        "kind": "unknown",
        "id": "55555555-5555-4555-8555-555555555555",
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
fn manifest_without_settings_has_none() {
    let path = write_manifest(
        r#"{
        "contract_version": 1,
        "id": "66666666-6666-4666-8666-666666666666",
        "name": "settings",
        "description": "Настройки",
        "module": "settings.wasm",
        "export": "invoke",
        "host_functions": []
      }"#,
    );

    let manifest = PluginManifest::load(&path).expect("парсинг манифеста");
    assert!(
        manifest.settings.is_none(),
        "поле настроек отсутствует при отсутствии декларации"
    );
    assert!(!manifest.sample, "плагин по умолчанию не образец");
    fs::remove_dir_all(path.parent().expect("директория")).expect("очистка");
}

#[test]
fn parses_sample_flag() {
    let path = write_manifest(
        r#"{
        "contract_version": 1,
        "id": "88888888-8888-4888-8888-888888888888",
        "name": "demo",
        "description": "Образец",
        "module": "demo.wasm",
        "export": "invoke",
        "host_functions": [],
        "sample": true
      }"#,
    );

    let manifest = PluginManifest::load(&path).expect("парсинг образца");
    assert!(manifest.sample, "признак образца прочитан");
    fs::remove_dir_all(path.parent().expect("директория")).expect("очистка");
}

#[test]
fn parses_settings_declaration() {
    let path = write_manifest(
        r#"{
        "contract_version": 1,
        "id": "77777777-7777-4777-8777-777777777777",
        "name": "settings",
        "description": "Настройки",
        "module": "settings.wasm",
        "export": "invoke",
        "host_functions": [],
        "settings": {
          "title": "Уведомления",
          "sections": [
            { "id": "general", "title": "Общие", "defaults": { "welcome_notification": false } }
          ]
        }
      }"#,
    );

    let manifest = PluginManifest::load(&path).expect("парсинг декларации настроек");
    let settings = manifest.settings.expect("декларация настроек");
    assert_eq!(settings["title"], "Уведомления");
    assert_eq!(settings["sections"][0]["id"], "general");
    assert_eq!(
        settings["sections"][0]["defaults"]["welcome_notification"],
        serde_json::json!(false)
    );
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

#[test]
fn missing_id_is_rejected() {
    let path = write_manifest(
        r#"{
        "contract_version": 1,
        "name": "plugin",
        "description": "x",
        "module": "p.wasm",
        "export": "invoke",
        "host_functions": []
      }"#,
    );

    let result = PluginManifest::load(&path);
    assert!(result.is_err(), "манифест без id отклоняется");

    let dir = path.parent().expect("директория");
    fs::remove_dir_all(dir).expect("очистка");
}

#[test]
fn invalid_id_is_rejected() {
    let path = write_manifest(
        r#"{
        "contract_version": 1,
        "id": "not-a-uuid",
        "name": "plugin",
        "description": "x",
        "module": "p.wasm",
        "export": "invoke",
        "host_functions": []
      }"#,
    );

    let manifest = PluginManifest::load(&path).expect("парсинг манифеста");
    let result = manifest.validate(path.parent().expect("директория"));
    assert!(
        matches!(result, Err(PluginError::InvalidManifest { .. })),
        "некорректный id отклоняется"
    );

    let dir = path.parent().expect("директория");
    fs::remove_dir_all(dir).expect("очистка");
}

#[test]
fn parses_format_manifest_without_wasm() {
    let path = write_manifest(
        r#"{
        "contract_version": 1,
        "level": "application", "kind": "format",
        "id": "88888888-8888-4888-8888-888888888888",
        "name": "pdf-viewer",
        "description": "Читалка PDF",
        "formats": ["pdf"],
        "viewer": "viewer/index.html",
        "host_functions": []
      }"#,
    );

    let manifest = PluginManifest::load(&path).expect("парсинг манифеста формата");
    assert_eq!(manifest.kind, crate::plugin::PluginKind::Format);
    assert_eq!(manifest.formats, ["pdf"]);
    assert_eq!(manifest.viewer.as_deref(), Some("viewer/index.html"));
    assert!(manifest.module.is_empty(), "WASM-модуль необязателен");
    manifest
        .validate(path.parent().expect("директория"))
        .expect("валидный манифест формата");
    fs::remove_dir_all(path.parent().expect("директория")).expect("очистка");
}

#[test]
fn format_without_viewer_is_rejected() {
    let path = write_manifest(
        r#"{
        "contract_version": 1,
        "level": "application", "kind": "format",
        "id": "99999999-9999-4999-8999-999999999999",
        "name": "pdf-viewer",
        "description": "Читалка PDF",
        "formats": ["pdf"],
        "host_functions": []
      }"#,
    );

    let manifest = PluginManifest::load(&path).expect("парсинг манифеста");
    let result = manifest.validate(path.parent().expect("директория"));
    assert!(
        matches!(result, Err(PluginError::InvalidManifest { .. })),
        "плагин формата без модуля рисования отклоняется"
    );
    fs::remove_dir_all(path.parent().expect("директория")).expect("очистка");
}

#[test]
fn format_without_formats_is_rejected() {
    let path = write_manifest(
        r#"{
        "contract_version": 1,
        "level": "application", "kind": "format",
        "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "name": "viewer",
        "description": "x",
        "formats": [],
        "viewer": "index.html",
        "host_functions": []
      }"#,
    );

    let manifest = PluginManifest::load(&path).expect("парсинг манифеста");
    let result = manifest.validate(path.parent().expect("директория"));
    assert!(
        matches!(result, Err(PluginError::InvalidManifest { .. })),
        "плагин формата без форматов отклоняется"
    );
    fs::remove_dir_all(path.parent().expect("директория")).expect("очистка");
}

#[test]
fn format_unsafe_viewer_path_is_rejected() {
    let path = write_manifest(
        r#"{
        "contract_version": 1,
        "level": "application", "kind": "format",
        "id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        "name": "viewer",
        "description": "x",
        "formats": ["pdf"],
        "viewer": "../outside.html",
        "host_functions": []
      }"#,
    );

    let manifest = PluginManifest::load(&path).expect("парсинг манифеста");
    let result = manifest.validate(path.parent().expect("директория"));
    assert!(
        matches!(result, Err(PluginError::InvalidManifest { .. })),
        "небезопасный путь модуля рисования отклоняется"
    );
    fs::remove_dir_all(path.parent().expect("директория")).expect("очистка");
}
