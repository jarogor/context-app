use super::*;
use crate::test_util;
use crate::test_util::cleanup;
use std::fs;
use std::path::PathBuf;

/// WAT-модуль, экспортирующий функцию `invoke`.
const WAT_WITH_INVOKE: &str = r#"
    (module
      (func (export "invoke") (result i32)
        i32.const 0))
  "#;

/// Создание директории плагинов с одним плагином.
fn setup_plugin(name: &str, manifest: &str) -> PathBuf {
    let dir = test_util::test_root(&format!("app-host-{name}"));
    let plugin_dir = dir.join(name);
    fs::create_dir_all(&plugin_dir).expect("директория плагина");
    fs::write(plugin_dir.join("plugin-manifest.json"), manifest).expect("манифест");
    fs::write(plugin_dir.join("plugin.wasm"), WAT_WITH_INVOKE).expect("модуль");
    dir
}

#[test]
fn loads_only_base_plugins() {
    let dir = test_util::test_root("app-host-kinds");
    cleanup(&dir);
    let base_dir = dir.join("base-notifications");
    let extension_dir = dir.join("extension-demo");
    fs::create_dir_all(&base_dir).expect("директория base");
    fs::create_dir_all(&extension_dir).expect("директория extension");
    fs::write(
        base_dir.join("plugin-manifest.json"),
        r#"{
        "contract_version": 1,
        "kind": "base",
        "name": "notifications",
        "description": "Уведомления",
        "module": "plugin.wasm",
        "export": "invoke",
        "host_functions": [],
        "provides": ["notifications.journal@1"]
      }"#,
    )
    .expect("манифест base");
    fs::write(
        extension_dir.join("plugin-manifest.json"),
        r#"{
        "contract_version": 1,
        "kind": "extension",
        "name": "demo",
        "description": "Демо",
        "module": "plugin.wasm",
        "export": "invoke",
        "host_functions": []
      }"#,
    )
    .expect("манифест extension");
    for directory in [&base_dir, &extension_dir] {
        fs::write(directory.join("plugin.wasm"), WAT_WITH_INVOKE).expect("модуль");
    }

    let host =
        AppPluginHost::load(std::slice::from_ref(&dir), dir.join("storage")).expect("загрузка");
    assert_eq!(host.plugin_names(), vec!["notifications".to_string()]);
    cleanup(&dir);
}

#[test]
fn missing_directory_is_skipped() {
    let dir = test_util::test_root("app-host-missing");
    let missing = dir.join("no-such-dir");
    let host = AppPluginHost::load(&[missing], dir.join("storage")).expect("загрузка");
    assert!(host.plugin_names().is_empty());
    cleanup(&dir);
}

#[test]
fn delivers_events_to_provider() {
    let dir = setup_plugin(
        "notifications",
        r#"{
        "contract_version": 1,
        "kind": "base",
        "name": "notifications",
        "description": "Уведомления",
        "module": "plugin.wasm",
        "export": "invoke",
        "host_functions": [],
        "provides": ["notifications.journal@1"]
      }"#,
    );
    let mut host =
        AppPluginHost::load(std::slice::from_ref(&dir), dir.join("storage")).expect("загрузка");
    host.notify_user("привет", "test", serde_json::json!({}));
    assert!(
        get_bus().is_empty(),
        "событие доставлено провайдеру и извлечено из bus"
    );
    cleanup(&dir);
}

#[test]
fn drops_events_without_provider() {
    let dir = setup_plugin(
        "demo",
        r#"{
        "contract_version": 1,
        "kind": "base",
        "name": "demo",
        "description": "Без уведомлений",
        "module": "plugin.wasm",
        "export": "invoke",
        "host_functions": []
      }"#,
    );
    let mut host =
        AppPluginHost::load(std::slice::from_ref(&dir), dir.join("storage")).expect("загрузка");
    host.notify_technical("шум", "test", serde_json::json!({}));
    assert!(get_bus().is_empty(), "событие отброшено без провайдера");
    cleanup(&dir);
}
