//! Тесты прав плагина: host-функции выдаются только объявленные.

use std::path::PathBuf;

use crate::plugin::PluginManifest;

/// Разбор манифеста из строки без файловой системы.
fn manifest(host_functions: &str) -> PluginManifest {
    serde_json::from_str(&format!(
        r#"{{
          "contract_version": 1,
          "level": "application",
          "kind": "extension",
          "id": "11111111-1111-4111-8111-111111111111",
          "name": "p",
          "description": "d",
          "module": "p.wasm",
          "export": "invoke",
          "host_functions": [{host_functions}]
        }}"#
    ))
    .expect("манифест")
}

/// Директория для валидации: важно лишь то, что она передаётся как путь.
fn dir() -> PathBuf {
    PathBuf::from("/tmp/plugin")
}

#[test]
fn declared_host_function_is_allowed() {
    let manifest = manifest(r#""state_read""#);
    assert!(
        super::declares_host_function(&manifest, "state_read"),
        "объявленная host-функция распознана"
    );
    assert!(
        !super::declares_host_function(&manifest, "state_write"),
        "необъявленная host-функция не выдаётся"
    );
    manifest.validate(&dir()).expect("валидный манифест");
}

#[test]
fn unknown_right_is_rejected() {
    let manifest = manifest(r#""read_everything""#);
    let result = manifest.validate(&dir());
    assert!(
        matches!(
            result,
            Err(crate::plugin::PluginError::InvalidManifest { .. })
        ),
        "неизвестное право отклоняется"
    );
}
