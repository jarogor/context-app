use super::*;
use crate::test_util;
use crate::test_util::cleanup;
use std::fs;
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

/// Манифест плагина-расширения под контракт v3.
const MANIFEST_JSON: &str = r#"{
    "contract_version": 1,
    "name": "test-plugin",
    "description": "Тестовый плагин",
    "module": "plugin.wasm",
    "export": "invoke",
    "host_functions": ["log"]
  }"#;

/// Создание корня плагинов с одной директорией плагина.
fn setup_plugins_root(name: &str, wasm: &[u8], manifest: &str) -> PathBuf {
    let dir = test_util::test_root(&format!("plugin-runtime-{name}"));
    let plugin_dir = dir.join("test-plugin");
    fs::create_dir_all(&plugin_dir).expect("создание директории плагина");
    fs::write(plugin_dir.join(MANIFEST_FILE_NAME), manifest).expect("манифест");
    fs::write(plugin_dir.join("plugin.wasm"), wasm).expect("модуль");
    dir
}

fn compile_wat(wat: &str) -> Vec<u8> {
    wat::parse_str(wat).expect("компиляция WAT")
}

#[test]
fn loads_plugin_with_invoke_export() {
    let dir = setup_plugins_root("with-invoke", &compile_wat(WAT_WITH_INVOKE), MANIFEST_JSON);
    let root = dir.clone();
    let runtime = PluginRuntime::load(&[dir], root.clone()).expect("загрузка runtime");
    assert_eq!(
        runtime.plugin_names(),
        vec!["test-plugin"],
        "плагин загружен"
    );
    cleanup(&root);
}

#[test]
fn rejects_plugin_without_invoke_export() {
    let dir = setup_plugins_root(
        "without-invoke",
        &compile_wat(WAT_WITHOUT_INVOKE),
        MANIFEST_JSON,
    );
    let root = dir.clone();
    let runtime = PluginRuntime::load(&[dir], root.clone()).expect("загрузка runtime");
    assert!(
        runtime.plugin_names().is_empty(),
        "плагин без invoke отбракован"
    );
    cleanup(&root);
}

#[test]
fn invokes_loaded_plugin() {
    let dir = setup_plugins_root("invoke", &compile_wat(WAT_WITH_INVOKE), MANIFEST_JSON);
    let root = dir.clone();
    let mut runtime = PluginRuntime::load(&[dir], root.clone()).expect("загрузка runtime");
    let output = runtime
        .invoke("test-plugin", "привет")
        .expect("вызов плагина");
    assert_eq!(output, "", "модуль возвращает пустой вывод");
    cleanup(&root);
}

#[test]
fn empty_dir_produces_no_plugins() {
    let dir = test_util::test_root("plugin-runtime-empty");
    let sandbox = dir.clone();

    let runtime = PluginRuntime::load(&[dir], sandbox.clone()).expect("загрузка пустого каталога");
    assert!(
        runtime.plugin_names().is_empty(),
        "нет плагинов в пустой папке"
    );
    cleanup(&sandbox);
}

#[test]
fn missing_directory_is_skipped() {
    let dir = test_util::test_root("plugin-runtime-missing-dir");
    let missing = dir.join("no-such-dir");

    let runtime = PluginRuntime::load(&[missing], &dir).expect("загрузка с отсутствующей папкой");
    assert!(
        runtime.plugin_names().is_empty(),
        "отсутствующая директория не мешает загрузке"
    );
    cleanup(&dir);
}

#[test]
fn sandbox_resolves_paths_inside_root() {
    let root = test_util::test_root("plugin-sandbox-inside");
    cleanup(&root);
    fs::create_dir_all(root.join("data")).expect("создание папки");
    fs::write(root.join("data").join("note.txt"), "текст").expect("запись файла");
    let sandbox_root = Arc::new(Mutex::new(root.clone()));

    let resolved = resolve_sandboxed(&sandbox_root, "data").expect("разрешение папки");
    assert_eq!(
        resolved,
        root.join("data").canonicalize().expect("канонизация")
    );
    let file = resolve_sandboxed(&sandbox_root, "data/note.txt").expect("разрешение файла");
    assert_eq!(
        file,
        root.join("data")
            .join("note.txt")
            .canonicalize()
            .expect("канонизация")
    );
    let nested = resolve_sandboxed(&sandbox_root, "data/../data/note.txt");
    assert!(nested.is_ok(), "путь с `..` внутри корня разрешается");
    cleanup(&root);
}

#[test]
fn sandbox_rejects_paths_outside_root() {
    let parent = test_util::test_root("plugin-sandbox-outside-parent");
    cleanup(&parent);
    let root = parent.join("source-root");
    let outside = parent.join("target");
    fs::create_dir_all(&outside).expect("создание внешней папки");
    let sandbox_root = Arc::new(Mutex::new(root));

    let attempt = resolve_sandboxed(&sandbox_root, "../target/");
    assert!(attempt.is_err(), "путь за пределами корня отклоняется");
    let missing = resolve_sandboxed(&sandbox_root, "no-such-dir");
    assert!(missing.is_err(), "отсутствующий путь отклоняется");
    cleanup(&parent);
}

#[test]
fn storage_accepts_only_single_file_keys() {
    let root = test_util::test_root("plugin-storage-root");
    cleanup(&root);
    fs::create_dir_all(&root).expect("создание storage");
    let storage = Arc::new(Mutex::new(Some(root.clone())));

    assert!(resolve_storage_key(&storage, "state.json").is_ok());
    assert!(resolve_storage_key(&storage, "nested/state.json").is_err());
    assert!(resolve_storage_key(&storage, "../state.json").is_err());
    assert!(resolve_storage_key(&storage, "/tmp/state.json").is_err());

    cleanup(&root);
}

#[test]
fn loads_and_invokes_bundled_demo() {
    let root = test_util::test_root("plugin-runtime-demo");
    let plugin_dir = root.join("demo");
    fs::create_dir_all(&plugin_dir).expect("создание директории плагина");
    let resources = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("plugins")
        .join("demo");
    for file in ["plugin-manifest.json", "demo.wasm"] {
        fs::copy(resources.join(file), plugin_dir.join(file)).expect("копирование ресурса");
    }

    let root_copy = root.clone();
    let mut runtime = PluginRuntime::load(&[root], root_copy.clone()).expect("загрузка runtime");
    assert_eq!(runtime.plugin_names(), vec!["demo"], "demo-плагин загружен");

    let output = runtime
        .invoke("demo", r#"{"title":"Тест"}"#)
        .expect("вызов demo-плагина");
    let parsed: serde_json::Value = serde_json::from_str(&output).expect("JSON-ответ");
    let greeting = parsed["greeting"].as_str().expect("поле greeting");
    assert!(greeting.contains("Тест"), "ответ содержит переданное имя");

    let events = crate::plugin::get_bus().drain();
    assert!(
        events
            .iter()
            .any(|event| event.message.contains("Тест") && event.level == "technical"),
        "host-функция log опубликовала техническое событие"
    );

    cleanup(&root_copy);
}

/// Манифест плагина, предоставляющего capability.
const MANIFEST_WITH_CAPABILITY: &str = r#"{
    "contract_version": 1,
    "name": "provider",
    "description": "Провайдер capability",
    "module": "plugin.wasm",
    "export": "invoke",
    "host_functions": [],
    "provides": ["test.capability@1"]
  }"#;

#[test]
fn routes_capability_to_provider() {
    let dir = setup_plugins_root(
        "capability",
        &compile_wat(WAT_WITH_INVOKE),
        MANIFEST_WITH_CAPABILITY,
    );
    let root = dir.clone();
    let mut runtime = PluginRuntime::load(&[dir], root.clone()).expect("загрузка runtime");
    assert_eq!(
        runtime.plugin_providing("test.capability@1"),
        Some("provider".to_string())
    );
    let output = runtime
        .invoke_capability("test.capability@1", "ping", serde_json::json!({}))
        .expect("маршрутизация операции");
    assert_eq!(output, "", "провайдер вызван");
    cleanup(&root);
}

#[test]
fn missing_capability_is_reported() {
    let dir = setup_plugins_root(
        "missing-capability",
        &compile_wat(WAT_WITH_INVOKE),
        MANIFEST_JSON,
    );
    let root = dir.clone();
    let mut runtime = PluginRuntime::load(&[dir], root.clone()).expect("загрузка runtime");
    assert!(runtime.plugin_providing("none@1").is_none());
    let result = runtime.invoke_capability("none@1", "ping", serde_json::json!({}));
    assert!(
        matches!(
            result,
            Err(crate::plugin::PluginError::MissingCapability(_))
        ),
        "отсутствие провайдера диагностируется"
    );
    cleanup(&root);
}
