use super::*;
use crate::plugin::Severity;
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
    let base_dir = dir.join("base-settings");
    let extension_dir = dir.join("extension-demo");
    fs::create_dir_all(&base_dir).expect("директория base");
    fs::create_dir_all(&extension_dir).expect("директория extension");
    fs::write(
        base_dir.join("plugin-manifest.json"),
        r#"{
        "contract_version": 1,
        "level": "framework", "kind": "framework",
        "id": "313fbeb9-8537-48bc-bb5f-5296e7b1c81e",
        "name": "settings",
        "description": "Настройки",
        "module": "plugin.wasm",
        "export": "invoke",
        "host_functions": [],
        "provides": ["settings.store@1"]
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
    assert_eq!(host.plugin_names(), vec!["settings".to_string()]);
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
fn notify_user_writes_diagnostics() {
    let dir = setup_plugin(
        "demo",
        r#"{
        "contract_version": 1,
        "level": "framework", "kind": "framework",
        "id": "e6ddd2e8-a62c-4350-b431-2bb4f2cb8d5c",
        "name": "demo",
        "description": "Без плагинов уведомлений",
        "module": "plugin.wasm",
        "export": "invoke",
        "host_functions": []
      }"#,
    );
    crate::plugin::diagnostics::init(&dir);
    let mut host =
        AppPluginHost::load(std::slice::from_ref(&dir), dir.join("storage")).expect("загрузка");
    host.notify_user(Severity::Info, "привет", "test", serde_json::json!({}));

    let content =
        std::fs::read_to_string(dir.join(crate::plugin::diagnostics::DIAGNOSTICS_FILE_NAME))
            .expect("журнал диагностики");
    assert!(
        content.contains("привет") && content.contains("[test]"),
        "сообщение пользователю записано в журнал: {content}"
    );
    cleanup(&dir);
}

#[test]
fn refresh_registry_without_provider_is_safe() {
    let dir = setup_plugin(
        "demo",
        r#"{
        "contract_version": 1,
        "level": "framework", "kind": "framework",
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
    // Без провайдера настроек приложение работает с умолчаниями.
    assert_eq!(host.theme_preference(), "system", "тема по умолчанию");
    cleanup(&dir);
}

#[test]
fn refresh_registry_with_provider_succeeds() {
    let dir = setup_plugin(
        "settings",
        r#"{
        "contract_version": 1,
        "level": "framework", "kind": "framework",
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
        "owner": "books-source",
        "kind": "books",
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
        "owner": "books-source",
        "kind": "books",
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
        ids.contains(&"books-source.catalog".to_string()),
        "секция плагина источника книг попала в реестр"
    );
    assert!(
        ids.contains(&"app.general".to_string()),
        "секция приложения попала в реестр"
    );
    cleanup(&storage);
}

/// Проверка, что поле выбора палитры зарегистрировано в секции приложения.
#[test]
fn refresh_registry_includes_palette_field() {
    let bundled = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("base-plugins");
    let storage = test_util::test_root("app-host-palette-field");
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
    let palette_field = app_section["fields"]
        .as_array()
        .expect("поля секции")
        .iter()
        .find(|field| field["key"] == "appearance.palette")
        .expect("поле палитры");
    assert_eq!(palette_field["type"], "select", "тип поля палитры");
    assert_eq!(
        app_section["values"]["appearance.palette"], "linen",
        "значение по умолчанию для палитры"
    );
    cleanup(&storage);
}

/// Проверка, что поле языка интерфейса зарегистрировано в секции приложения.
///
/// Язык выбирается настройкой и по умолчанию русский; без поля переключить
/// язык интерфейса было бы нечем.
#[test]
fn refresh_registry_includes_language_field() {
    let bundled = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("base-plugins");
    let storage = test_util::test_root("app-host-language-field");
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
    let language_field = app_section["fields"]
        .as_array()
        .expect("поля секции")
        .iter()
        .find(|field| field["key"] == "appearance.language")
        .expect("поле языка");
    assert_eq!(language_field["type"], "select", "тип поля языка");
    let options: Vec<&str> = language_field["options"]
        .as_array()
        .expect("варианты языка")
        .iter()
        .filter_map(|option| option["value"].as_str())
        .collect();
    assert_eq!(options, vec!["ru", "en"], "языки интерфейса");
    assert_eq!(
        app_section["values"]["appearance.language"], "ru",
        "язык по умолчанию"
    );
    cleanup(&storage);
}

/// Язык интерфейса по умолчанию — русский, а сохранённый `en` читается.
#[test]
fn interface_locale_defaults_to_russian_and_reads_saved_value() {
    let bundled = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("base-plugins");
    let storage = test_util::test_root("app-host-interface-locale");
    let mut host = AppPluginHost::load(&[bundled], storage.join("storage"))
        .expect("загрузка базовых плагинов");
    host.refresh_settings_registry(&[]).expect("регистрация");
    assert_eq!(host.interface_locale(), "ru", "язык по умолчанию");

    host.invoke_capability(
        CAPABILITY_SETTINGS,
        "set",
        serde_json::json!({
            "section": "app.general",
            "values": { "appearance.language": "en" }
        }),
    )
    .expect("сохранение языка");
    assert_eq!(host.interface_locale(), "en", "сохранённый язык");

    host.invoke_capability(
        CAPABILITY_SETTINGS,
        "set",
        serde_json::json!({
            "section": "app.general",
            "values": { "appearance.language": "de" }
        }),
    )
    .expect("сохранение неизвестного языка");
    assert_eq!(
        host.interface_locale(),
        "ru",
        "неизвестный язык даёт русский"
    );
    cleanup(&storage);
}

/// Проверка, что поле темы оформления зарегистрировано в секции приложения.
///
/// Кнопка в шапке переключает только между светлой и тёмной, поэтому режим
/// «как в системе» доступен лишь настройкой — без поля вернуть его нельзя.
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
    let options: Vec<&str> = theme_field["options"]
        .as_array()
        .expect("варианты темы")
        .iter()
        .filter_map(|option| option["value"].as_str())
        .collect();
    // Все три режима: явные стороны и следование теме системы.
    assert_eq!(options, vec!["light", "dark", "system"]);
    assert_eq!(
        app_section["values"]["appearance.theme"], "system",
        "значение по умолчанию для темы"
    );
    cleanup(&storage);
}

/// Проверка, что поле лимита открытых вкладок зарегистрировано в секции
/// приложения с числовым типом и значением по умолчанию.
#[test]
fn refresh_registry_includes_open_tabs_limit_field() {
    let bundled = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("base-plugins");
    let storage = test_util::test_root("app-host-open-tabs-limit-field");
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
    let limit_field = app_section["fields"]
        .as_array()
        .expect("поля секции")
        .iter()
        .find(|field| field["key"] == "window.open_tabs_limit")
        .expect("поле лимита открытых вкладок");
    assert_eq!(
        limit_field["type"], "number",
        "тип поля лимита открытых вкладок"
    );
    assert_eq!(
        app_section["values"]["window.open_tabs_limit"], 50,
        "значение по умолчанию для лимита открытых вкладок"
    );
    cleanup(&storage);
}

/// Проверка чтения лимита открытых вкладок и его нормализации.
#[test]
fn open_tabs_limit_reads_and_normalizes_setting() {
    let bundled = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("base-plugins");
    let storage = test_util::test_root("app-host-open-tabs-limit");
    let mut host = AppPluginHost::load(std::slice::from_ref(&bundled), storage.join("storage"))
        .expect("загрузка базовых плагинов");
    host.refresh_settings_registry(&[]).expect("регистрация");
    assert_eq!(host.open_tabs_limit(), 50, "значение по умолчанию");

    host.invoke_capability(
        CAPABILITY_SETTINGS,
        "set",
        serde_json::json!({
            "section": "app.general",
            "values": { "window.open_tabs_limit": 12 }
        }),
    )
    .expect("сохранение лимита");
    assert_eq!(host.open_tabs_limit(), 12, "лимит прочитан из настроек");

    host.invoke_capability(
        CAPABILITY_SETTINGS,
        "set",
        serde_json::json!({
            "section": "app.general",
            "values": { "window.open_tabs_limit": 0 }
        }),
    )
    .expect("сохранение нуля");
    assert_eq!(
        host.open_tabs_limit(),
        1,
        "нулевой лимит приведён к единице"
    );
    cleanup(&storage);
}

/// Проверка сквозного сценария настроек: реестр приложения и сохранение
/// значения между перезапусками runtime.
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
    // Секции уведомлений больше нет: журнал пользовательский, а техническая
    // диагностика пишется в файл. Значения секции приложения переживают
    // перезапуск — на этом же механизме держатся все настройки.
    host.invoke_capability(
        CAPABILITY_SETTINGS,
        "set",
        serde_json::json!({
            "section": "app.general",
            "values": { "appearance.theme": "dark" }
        }),
    )
    .expect("сохранение значения");

    let mut restarted =
        AppPluginHost::load(&[bundled], storage.join("storage")).expect("второй запуск");
    restarted
        .refresh_settings_registry(&[])
        .expect("регистрация");
    assert_eq!(
        restarted.theme_preference(),
        "dark",
        "значение пережило перезапуск"
    );
    cleanup(&storage);
}

#[test]
fn notify_technical_writes_diagnostics() {
    let dir = setup_plugin(
        "demo",
        r#"{
        "contract_version": 1,
        "level": "framework", "kind": "framework",
        "id": "e6ddd2e8-a62c-4350-b431-2bb4f2cb8d5c",
        "name": "demo",
        "description": "Без уведомлений",
        "module": "plugin.wasm",
        "export": "invoke",
        "host_functions": []
      }"#,
    );
    crate::plugin::diagnostics::init(&dir);
    let mut host =
        AppPluginHost::load(std::slice::from_ref(&dir), dir.join("storage")).expect("загрузка");
    host.notify_technical(Severity::Info, "шум", "test", serde_json::json!({}));

    let content =
        std::fs::read_to_string(dir.join(crate::plugin::diagnostics::DIAGNOSTICS_FILE_NAME))
            .expect("журнал диагностики");
    assert!(
        content.contains("шум") && content.contains("[test]"),
        "техническое событие записано в журнал: {content}"
    );
    cleanup(&dir);
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

/// Проверка чтения палитры оформления из настроек приложения.
#[test]
fn theme_palette_reads_setting() {
    let bundled = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("base-plugins");
    let storage = test_util::test_root("app-host-theme-palette");
    let mut host = AppPluginHost::load(std::slice::from_ref(&bundled), storage.join("storage"))
        .expect("загрузка базовых плагинов");
    host.refresh_settings_registry(&[]).expect("регистрация");
    assert_eq!(host.theme_palette(), "linen", "значение по умолчанию");

    host.invoke_capability(
        CAPABILITY_SETTINGS,
        "set",
        serde_json::json!({
            "section": "app.general",
            "values": { "appearance.palette": "cobalt" }
        }),
    )
    .expect("сохранение палитры");
    assert_eq!(
        host.theme_palette(),
        "cobalt",
        "палитра прочитана из настроек"
    );
    cleanup(&storage);
}

/// Проверка чтения темы области чтения из настроек приложения.
#[test]
fn reader_theme_reads_setting() {
    let bundled = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("base-plugins");
    let storage = test_util::test_root("app-host-reader-theme");
    let mut host = AppPluginHost::load(std::slice::from_ref(&bundled), storage.join("storage"))
        .expect("загрузка базовых плагинов");
    host.refresh_settings_registry(&[]).expect("регистрация");
    assert_eq!(host.reader_theme(), "light", "значение по умолчанию");

    host.invoke_capability(
        CAPABILITY_SETTINGS,
        "set",
        serde_json::json!({
            "section": "app.general",
            "values": { "reader.theme": "dark" }
        }),
    )
    .expect("сохранение темы области чтения");
    assert_eq!(
        host.reader_theme(),
        "dark",
        "тема области чтения прочитана из настроек"
    );

    host.invoke_capability(
        CAPABILITY_SETTINGS,
        "set",
        serde_json::json!({
            "section": "app.general",
            "values": { "reader.theme": "неизвестная" }
        }),
    )
    .expect("сохранение неизвестного значения");
    assert_eq!(
        host.reader_theme(),
        "light",
        "неизвестное значение приведено к light"
    );
    cleanup(&storage);
}

/// Полей, которые переключаются кнопками в панели чтения, в настройках нет.
///
/// Гарнитура книги и тема области чтения переключаются кнопками панели чтения:
/// значение всё равно сохраняется в настройках, но дублировать его полем на
/// странице настроек — лишний путь к тому же значению.
#[test]
fn registry_skips_fields_switched_by_reader_buttons() {
    let bundled = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("base-plugins");
    let storage = test_util::test_root("app-host-reader-toggle-fields");
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
    let keys: Vec<&str> = app_section["fields"]
        .as_array()
        .expect("поля секции")
        .iter()
        .filter_map(|field| field["key"].as_str())
        .collect();

    assert!(
        !keys.contains(&"reader.font"),
        "гарнитура книги переключается кнопкой в панели чтения"
    );
    assert!(
        !keys.contains(&"reader.theme"),
        "тема области чтения переключается кнопкой в панели чтения"
    );
    // Тема интерфейса переключается кнопкой в шапке, но остаётся и настройкой:
    // кнопка ведёт только между светлой и тёмной, а вернуть «как в системе»
    // можно лишь в настройках.
    assert!(
        keys.contains(&"appearance.theme"),
        "режим «как в системе» выбирается в настройках"
    );
    // Палитра кнопки не имеет: она остаётся настройкой.
    assert!(
        keys.contains(&"appearance.palette"),
        "палитра интерфейса в настройках"
    );
    // Диагностика не настраивается: журнал пишется всегда и целиком, а
    // пользователю не нужно решать, что в него писать.
    assert!(
        !keys.contains(&"diagnostics.log_level"),
        "журнал не имеет настроек"
    );
    cleanup(&storage);
}

/// Проверка чтения гарнитуры книги из настроек приложения.
#[test]
fn reader_font_reads_setting() {
    let bundled = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("base-plugins");
    let storage = test_util::test_root("app-host-reader-font");
    let mut host = AppPluginHost::load(&[bundled], storage.join("storage"))
        .expect("загрузка базовых плагинов");
    host.refresh_settings_registry(&[]).expect("регистрация");
    assert_eq!(host.reader_font(), "serif", "значение по умолчанию");

    host.invoke_capability(
        CAPABILITY_SETTINGS,
        "set",
        serde_json::json!({
            "section": "app.general",
            "values": { "reader.font": "sans" }
        }),
    )
    .expect("сохранение гарнитуры книги");
    assert_eq!(
        host.reader_font(),
        "sans",
        "гарнитура прочитана из настроек"
    );

    host.invoke_capability(
        CAPABILITY_SETTINGS,
        "set",
        serde_json::json!({
            "section": "app.general",
            "values": { "reader.font": "неизвестная" }
        }),
    )
    .expect("сохранение неизвестного значения");
    assert_eq!(
        host.reader_font(),
        "serif",
        "неизвестное значение приведено к serif"
    );
    cleanup(&storage);
}

/// Проверка сквозного сценария заметок: создание набора и заметки и сохранение
/// их между перезапусками runtime, а также безвредный отказ без плагина.
#[test]
fn notes_registry_survives_restart() {
    let resources = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources");
    let bundled_base = resources.join("base-plugins");
    let bundled_plugins = resources.join("plugins");
    let directories = vec![bundled_base.clone(), bundled_plugins.clone()];
    let storage = test_util::test_root("app-host-notes-restart");

    let mut host =
        AppPluginHost::load(&directories, storage.join("storage")).expect("первый запуск");
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
        AppPluginHost::load(&directories, storage.join("storage")).expect("второй запуск");
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
        "level": "framework", "kind": "framework",
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

/// Проверка, что встроенный источник обновлений плагинов регистрируется сам и
/// не дублируется при повторной сборке runtime.
#[test]
fn ensures_plugin_source_once() {
    let resources = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources");
    let directories = vec![resources.join("base-plugins")];
    let storage = test_util::test_root("app-host-plugin-source");
    let source = crate::update::UpdateSource {
        kind: "file".to_string(),
        location: "/data/plugin-updates".to_string(),
    };

    let mut host = AppPluginHost::load(&directories, storage.join("storage")).expect("runtime");
    host.ensure_plugin_source(source.clone()).expect("источник добавлен");
    host.ensure_plugin_source(source).expect("повтор безвреден");

    let listed = host
        .invoke_capability(
            crate::plugin::contract::CAPABILITY_PLUGIN_STORE,
            "stores_list",
            serde_json::json!({}),
        )
        .expect("список мест");
    let listed: serde_json::Value = serde_json::from_str(&listed).expect("JSON списка");
    let stores = listed["stores"].as_array().expect("массив мест");
    assert_eq!(stores.len(), 1, "источник добавлен один раз: {listed}");
    assert_eq!(stores[0]["location"], "/data/plugin-updates");
    assert_eq!(stores[0]["id"], "plugin-updates");
    cleanup(&storage);
}
