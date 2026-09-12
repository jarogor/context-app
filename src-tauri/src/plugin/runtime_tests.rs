use super::*;
use crate::test_util;
use std::path::PathBuf;

/// WAT-модуль, экспортирующий функцию `invoke`, возвращающую код 0.
const WAT_WITH_INVOKE: &str = r#"
    (module
      (func (export "invoke") (result i32)
        i32.const 0))
  "#;

/// WAT-модуль без функции `invoke`.
const WAT_WITHOUT_INVOKE: &str = r#"
    (module
      (func (export "other") (result i32)
        i32.const 0))
  "#;

const MANIFEST_JSON: &str = r#"{
    "contract_version": 1,
    "name": "test-plugin",
    "description": "Тестовый плагин",
    "module": "plugin.wasm",
    "export": "invoke",
    "host_functions": ["log"]
  }"#;

/// Создание корня плагинов с одной директорией плагина.
fn setup_plugins_root(name: &str, wasm: &[u8]) -> PathBuf {
    let dir = test_util::test_root(&format!("plugin-runtime-{name}"));
    let plugin_dir = dir.join("test-plugin");
    fs::create_dir_all(&plugin_dir).expect("создание директории плагина");
    fs::write(plugin_dir.join(MANIFEST_FILE_NAME), MANIFEST_JSON).expect("манифест");
    fs::write(plugin_dir.join("plugin.wasm"), wasm).expect("модуль");
    dir
}

fn compile_wat(wat: &str) -> Vec<u8> {
    wat::parse_str(wat).expect("компиляция WAT")
}

#[test]
fn loads_plugin_with_invoke_export() {
    let dir = setup_plugins_root("with-invoke", &compile_wat(WAT_WITH_INVOKE));
    let runtime = PluginRuntime::load(&dir).expect("загрузка runtime");
    assert_eq!(
        runtime.plugin_names(),
        vec!["test-plugin"],
        "плагин загружен"
    );
    test_util::cleanup(&dir);
}

#[test]
fn rejects_plugin_without_invoke_export() {
    let dir = setup_plugins_root("without-invoke", &compile_wat(WAT_WITHOUT_INVOKE));
    let runtime = PluginRuntime::load(&dir).expect("загрузка runtime");
    assert!(
        runtime.plugin_names().is_empty(),
        "плагин без invoke отбракован"
    );
    test_util::cleanup(&dir);
}

#[test]
fn invokes_loaded_plugin() {
    let dir = setup_plugins_root("invoke", &compile_wat(WAT_WITH_INVOKE));
    let mut runtime = PluginRuntime::load(&dir).expect("загрузка runtime");
    let output = runtime
        .invoke("test-plugin", "привет")
        .expect("вызов плагина");
    assert_eq!(output, "", "модуль возвращает пустой вывод");
    test_util::cleanup(&dir);
}

#[test]
fn empty_dir_produces_no_plugins() {
    let dir = test_util::test_root("plugin-runtime-empty");

    let runtime = PluginRuntime::load(&dir).expect("загрузка пустого каталога");
    assert!(
        runtime.plugin_names().is_empty(),
        "нет плагинов в пустой папке"
    );
    test_util::cleanup(&dir);
}

#[test]
fn loads_and_invokes_bundled_demo_plugin() {
    let root = test_util::test_root("plugin-runtime-demo");
    let plugin_dir = root.join("demo-plugin");
    fs::create_dir_all(&plugin_dir).expect("создание директории плагина");
    let resources = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("plugins")
        .join("demo-plugin");
    for file in ["plugin-manifest.json", "demo_plugin.wasm"] {
        fs::copy(resources.join(file), plugin_dir.join(file)).expect("копирование ресурса");
    }

    let mut runtime = PluginRuntime::load(&root).expect("загрузка runtime");
    assert_eq!(
        runtime.plugin_names(),
        vec!["demo-plugin"],
        "demo-плагин загружен"
    );

    let output = runtime
        .invoke("demo-plugin", r#"{"title":"Тест"}"#)
        .expect("вызов demo-плагина");
    let parsed: serde_json::Value = serde_json::from_str(&output).expect("JSON-ответ");
    let greeting = parsed["greeting"].as_str().expect("поле greeting");
    assert!(greeting.contains("Тест"), "ответ содержит переданное имя");

    let logs = runtime.logs();
    assert!(
        logs.iter().any(|m| m.contains("Тест")),
        "host-функция log передала сообщение приложению"
    );

    test_util::cleanup(&root);
}
