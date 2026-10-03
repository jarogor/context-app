use super::*;
use crate::plugin::Severity;
use crate::test_util;
use crate::test_util::cleanup;
use std::fs;
use std::path::PathBuf;

/// Идентификатор базового плагина уведомлений.
const NOTIFICATIONS_ID: &str = "313fbeb9-8537-48bc-bb5f-5296e7b1c81e";

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
        "id": "313fbeb9-8537-48bc-bb5f-5296e7b1c81e",
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
        "id": "e6ddd2e8-a62c-4350-b431-2bb4f2cb8d5c",
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
        "id": "313fbeb9-8537-48bc-bb5f-5296e7b1c81e",
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
    host.notify_user(Severity::Info, "привет", "test", serde_json::json!({}));
    let remaining = get_bus().drain();
    assert!(
        !remaining.iter().any(|event| event.message == "привет"),
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
        "id": "e6ddd2e8-a62c-4350-b431-2bb4f2cb8d5c",
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
        "id": "69b39e5d-0c25-4cdb-8c3e-d3ba89147c24",
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
        .invoke_capability(CAPABILITY_SETTINGS, "list", serde_json::json!({}))
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

/// Проверка, что поле выбора темы зарегистрировано в секции приложения.
#[test]
fn refresh_registry_includes_theme_field() {
    let bundled = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("base-plugins");
    let storage = test_util::test_root("app-host-theme-field");
    let mut host = AppPluginHost::load(&[bundled], storage.join("storage"))
        .expect("загрузка базовых плагинов");
    host.refresh_settings_registry(&[]).expect("регистрация");

    let output = host
        .invoke_capability(CAPABILITY_SETTINGS, "list", serde_json::json!({}))
        .expect("список секций");
    let parsed: serde_json::Value = serde_json::from_str(&output).expect("JSON списка");
    let app_section = parsed["sections"]
        .as_array()
        .expect("массив секций")
        .iter()
        .find(|section| section["id"] == "app.general")
        .expect("секция приложения");
    let theme_field = app_section["fields"]
        .as_array()
        .expect("поля секции")
        .iter()
        .find(|field| field["key"] == "appearance.theme")
        .expect("поле темы");
    assert_eq!(theme_field["type"], "select", "тип поля темы");
    assert_eq!(
        app_section["values"]["appearance.theme"], "system",
        "значение по умолчанию для темы"
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
            .invoke_capability(CAPABILITY_SETTINGS, "list", serde_json::json!({}))
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
    let notifications_section = format!("{NOTIFICATIONS_ID}.notifications");
    assert!(
        ids.contains(&notifications_section),
        "секция уведомлений под идентификатором владельца"
    );

    let defaults = host
        .invoke_capability(
            CAPABILITY_SETTINGS,
            "get",
            serde_json::json!({ "section": notifications_section }),
        )
        .expect("значения секции");
    let defaults: serde_json::Value = serde_json::from_str(&defaults).expect("JSON значений");
    assert_eq!(
        defaults["values"]["technical_visible_default"], false,
        "значение по умолчанию"
    );

    host.invoke_capability(
        CAPABILITY_SETTINGS,
        "set",
        serde_json::json!({
            "section": notifications_section,
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
        .invoke_capability(
            CAPABILITY_SETTINGS,
            "get",
            serde_json::json!({ "section": notifications_section }),
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
    host.notify_user(Severity::Info, "проверка", "test", serde_json::json!({}));

    let output = host
        .invoke_capability(CAPABILITY_NOTIFICATIONS, "list", serde_json::json!({}))
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
    host.notify_user(Severity::Info, "до сброса", "test", serde_json::json!({}));
    host.reset_notifications().expect("сброс журнала");

    let output = host
        .invoke_capability(CAPABILITY_NOTIFICATIONS, "list", serde_json::json!({}))
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
        "id": "e6ddd2e8-a62c-4350-b431-2bb4f2cb8d5c",
        "name": "demo",
        "description": "Без уведомлений",
        "module": "plugin.wasm",
        "export": "invoke",
        "host_functions": []
      }"#,
    );
    let mut host =
        AppPluginHost::load(std::slice::from_ref(&dir), dir.join("storage")).expect("загрузка");
    host.notify_technical(Severity::Info, "шум", "test", serde_json::json!({}));
    let remaining = get_bus().drain();
    assert!(
        !remaining.iter().any(|event| event.message == "шум"),
        "событие отброшено без провайдера"
    );
    cleanup(&dir);
}

#[test]
fn log_level_reads_setting_and_applies() {
    let bundled = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("base-plugins");
    let storage = test_util::test_root("app-host-log-level");
    let mut host = AppPluginHost::load(std::slice::from_ref(&bundled), storage.join("storage"))
        .expect("загрузка базовых плагинов");
    host.refresh_settings_registry(&[]).expect("регистрация");
    assert_eq!(host.log_level(), Severity::Info, "порог по умолчанию");

    host.invoke_capability(
        crate::plugin::contract::CAPABILITY_SETTINGS,
        "set",
        serde_json::json!({
            "section": "app.general",
            "values": { "diagnostics.log_level": "trace" }
        }),
    )
    .expect("сохранение порога");

    assert_eq!(
        host.log_level(),
        Severity::Trace,
        "порог прочитан из настроек"
    );
    host.refresh_log_level();
    assert_eq!(
        crate::plugin::bus::log_level(),
        Severity::Trace,
        "порог применён к шине"
    );

    crate::plugin::set_log_level(Severity::Info);
    cleanup(&storage);
}

/// Проверка чтения предпочтения темы из настроек приложения.
#[test]
fn theme_preference_reads_setting() {
    let bundled = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("base-plugins");
    let storage = test_util::test_root("app-host-theme-preference");
    let mut host = AppPluginHost::load(std::slice::from_ref(&bundled), storage.join("storage"))
        .expect("загрузка базовых плагинов");
    host.refresh_settings_registry(&[]).expect("регистрация");
    assert_eq!(host.theme_preference(), "system", "значение по умолчанию");

    host.invoke_capability(
        CAPABILITY_SETTINGS,
        "set",
        serde_json::json!({
            "section": "app.general",
            "values": { "appearance.theme": "dark" }
        }),
    )
    .expect("сохранение темы");
    assert_eq!(
        host.theme_preference(),
        "dark",
        "тема прочитана из настроек"
    );

    host.invoke_capability(
        CAPABILITY_SETTINGS,
        "set",
        serde_json::json!({
            "section": "app.general",
            "values": { "appearance.theme": "неизвестная" }
        }),
    )
    .expect("сохранение неизвестного значения");
    assert_eq!(
        host.theme_preference(),
        "system",
        "неизвестное значение приведено к system"
    );
    cleanup(&storage);
}

/// Проверка сквозного сценария заметок: создание набора и заметки и сохранение
/// их между перезапусками runtime, а также безвредный отказ без плагина.
#[test]
fn notes_registry_survives_restart() {
    let bundled = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("base-plugins");
    let storage = test_util::test_root("app-host-notes-restart");

    let mut host = AppPluginHost::load(std::slice::from_ref(&bundled), storage.join("storage"))
        .expect("первый запуск");
    let created = host
        .invoke_capability(
            crate::plugin::contract::CAPABILITY_NOTES,
            "create_set",
            serde_json::json!({ "book_key": "lib/a", "name": "Мой набор" }),
        )
        .expect("создание набора");
    let created: serde_json::Value = serde_json::from_str(&created).expect("JSON набора");
    let set_id = created["set"]["id"]
        .as_str()
        .expect("идентификатор набора")
        .to_string();

    host.invoke_capability(
        crate::plugin::contract::CAPABILITY_NOTES,
        "add_note",
        serde_json::json!({
            "set_id": set_id,
            "note": { "anchor": "epubcfi(/6/4)", "text": "мысль" }
        }),
    )
    .expect("добавление заметки");

    let mut restarted =
        AppPluginHost::load(&[bundled], storage.join("storage")).expect("второй запуск");
    let output = restarted
        .invoke_capability(
            crate::plugin::contract::CAPABILITY_NOTES,
            "get_set",
            serde_json::json!({ "set_id": set_id }),
        )
        .expect("набор после перезапуска");
    let output: serde_json::Value = serde_json::from_str(&output).expect("JSON набора");
    assert_eq!(output["set"]["notes"][0]["text"], "мысль");
    assert_eq!(output["set"]["notes"][0]["anchor"], "epubcfi(/6/4)");
    cleanup(&storage);
}

/// Отсутствие плагина заметок даёт безвредный отказ маршрутизации.
#[test]
fn notes_capability_missing_provider_is_safe() {
    let dir = setup_plugin(
        "demo",
        r#"{
        "contract_version": 1,
        "kind": "base",
        "id": "e6ddd2e8-a62c-4350-b431-2bb4f2cb8d5c",
        "name": "demo",
        "description": "Без заметок",
        "module": "plugin.wasm",
        "export": "invoke",
        "host_functions": []
      }"#,
    );
    let mut host =
        AppPluginHost::load(std::slice::from_ref(&dir), dir.join("storage")).expect("загрузка");
    let result = host.invoke_capability(
        crate::plugin::contract::CAPABILITY_NOTES,
        "list_sets",
        serde_json::json!({ "book_key": "lib/a" }),
    );
    assert!(
        result.is_err(),
        "без провайдера операция отклоняется безвредно"
    );
    cleanup(&dir);
}
