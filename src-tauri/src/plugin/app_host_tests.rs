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
fn refresh_registry_without_provider_is_safe() {
    let dir = setup_plugin(
        "demo",
        r#"{
        "contract_version": 1,
        "kind": "base",
        "name": "demo",
        "description": "Без настроек",
        "module": "plugin.wasm",
        "export": "invoke",
        "host_functions": []
      }"#,
    );
    let mut host =
        AppPluginHost::load(std::slice::from_ref(&dir), dir.join("storage")).expect("загрузка");
    host.refresh_settings_registry(&[]).expect("без провайдера");
    assert!(
        host.welcome_notification_enabled(),
        "приветствие по умолчанию включено"
    );
    cleanup(&dir);
}

#[test]
fn refresh_registry_with_provider_succeeds() {
    let dir = setup_plugin(
        "settings",
        r#"{
        "contract_version": 1,
        "kind": "base",
        "name": "settings",
        "description": "Настройки",
        "module": "plugin.wasm",
        "export": "invoke",
        "host_functions": [],
        "provides": ["settings.store@1"]
      }"#,
    );
    let mut host =
        AppPluginHost::load(std::slice::from_ref(&dir), dir.join("storage")).expect("загрузка");
    host.refresh_settings_registry(&[serde_json::json!({
        "owner": "library",
        "kind": "source",
        "schema": { "sections": [] }
    })])
    .expect("регистрация реестра");
    cleanup(&dir);
}

#[test]
fn refresh_registry_includes_session_sources() {
    let bundled = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("base-plugins");
    let storage = test_util::test_root("app-host-settings-registry");
    let mut host = AppPluginHost::load(&[bundled], storage.join("storage"))
        .expect("загрузка базовых плагинов");
    host.refresh_settings_registry(&[serde_json::json!({
        "owner": "library",
        "kind": "source",
        "schema": {
            "title": "Библиотека",
            "sections": [ { "id": "catalog", "title": "Каталог" } ]
        }
    })])
    .expect("регистрация реестра");

    let output = host
        .invoke_operation("settings", "list", serde_json::json!({}))
        .expect("список секций");
    let parsed: serde_json::Value = serde_json::from_str(&output).expect("JSON списка");
    let ids: Vec<String> = parsed["sections"]
        .as_array()
        .expect("массив секций")
        .iter()
        .filter_map(|section| section["id"].as_str().map(str::to_string))
        .collect();
    assert!(
        ids.contains(&"library.catalog".to_string()),
        "секция source-плагина попала в реестр"
    );
    assert!(
        ids.contains(&"app.general".to_string()),
        "секция приложения попала в реестр"
    );
    cleanup(&storage);
}

/// Проверка сквозного сценария настроек: реестр приложения и уведомлений и
/// сохранение значения между перезапусками runtime.
#[test]
fn settings_registry_survives_restart() {
    let bundled = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("base-plugins");
    let storage = test_util::test_root("app-host-settings-restart");

    let section_ids = |host: &mut AppPluginHost| -> Vec<String> {
        let output = host
            .invoke_operation("settings", "list", serde_json::json!({}))
            .expect("список секций");
        let parsed: serde_json::Value = serde_json::from_str(&output).expect("JSON списка");
        parsed["sections"]
            .as_array()
            .expect("массив секций")
            .iter()
            .filter_map(|section| section["id"].as_str().map(str::to_string))
            .collect()
    };

    let mut host = AppPluginHost::load(std::slice::from_ref(&bundled), storage.join("storage"))
        .expect("первый запуск");
    host.refresh_settings_registry(&[]).expect("регистрация");
    let ids = section_ids(&mut host);
    assert!(
        ids.contains(&"app.general".to_string()),
        "секция приложения"
    );
    assert!(
        ids.contains(&"notifications.notifications".to_string()),
        "секция уведомлений"
    );

    let defaults = host
        .invoke_operation(
            "settings",
            "get",
            serde_json::json!({ "section": "notifications.notifications" }),
        )
        .expect("значения секции");
    let defaults: serde_json::Value = serde_json::from_str(&defaults).expect("JSON значений");
    assert_eq!(
        defaults["values"]["technical_visible_default"], false,
        "значение по умолчанию"
    );

    host.invoke_operation(
        "settings",
        "set",
        serde_json::json!({
            "section": "notifications.notifications",
            "values": { "technical_visible_default": true }
        }),
    )
    .expect("сохранение значения");

    let mut restarted =
        AppPluginHost::load(&[bundled], storage.join("storage")).expect("второй запуск");
    restarted
        .refresh_settings_registry(&[])
        .expect("регистрация");
    let restored = restarted
        .invoke_operation(
            "settings",
            "get",
            serde_json::json!({ "section": "notifications.notifications" }),
        )
        .expect("значения после перезапуска");
    let restored: serde_json::Value = serde_json::from_str(&restored).expect("JSON значений");
    assert_eq!(
        restored["values"]["technical_visible_default"], true,
        "значение пережило перезапуск"
    );
    cleanup(&storage);
}

#[test]
fn real_notifications_plugin_records_events() {
    let bundled = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("base-plugins");
    let storage = test_util::test_root("app-host-notifications-record");
    let mut host = AppPluginHost::load(std::slice::from_ref(&bundled), storage.join("storage"))
        .expect("загрузка базовых плагинов");
    host.notify_user("проверка", "test", serde_json::json!({}));

    let output = host
        .invoke_operation("notifications", "list", serde_json::json!({}))
        .expect("список журнала");
    let parsed: serde_json::Value = serde_json::from_str(&output).expect("JSON журнала");
    let entries = parsed["entries"].as_array().expect("массив записей");
    let recorded = entries
        .iter()
        .find(|entry| entry["message"] == "проверка")
        .expect("пользовательское событие записано в журнал");
    assert!(
        recorded["timestamp"].as_i64().unwrap_or_default() > 0,
        "метка времени получена от host-функции"
    );
    cleanup(&storage);
}

#[test]
fn reset_notifications_clears_journal() {
    let bundled = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("base-plugins");
    let storage = test_util::test_root("app-host-notifications-reset");
    let mut host = AppPluginHost::load(std::slice::from_ref(&bundled), storage.join("storage"))
        .expect("загрузка базовых плагинов");
    host.notify_user("до сброса", "test", serde_json::json!({}));
    host.reset_notifications().expect("сброс журнала");

    let output = host
        .invoke_operation("notifications", "list", serde_json::json!({}))
        .expect("список журнала");
    let parsed: serde_json::Value = serde_json::from_str(&output).expect("JSON журнала");
    assert!(
        parsed["entries"]
            .as_array()
            .expect("массив записей")
            .is_empty(),
        "журнал пуст после сброса"
    );
    cleanup(&storage);
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
