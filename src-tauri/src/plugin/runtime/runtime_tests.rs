use super::*;
use crate::plugin::contract::{HOST_STORE_INSTALLED, MANIFEST_FILE_NAME, STORE_HOST_FUNCTIONS};
use crate::plugin::{get_bus, set_log_level, PluginManifest, Severity};
use crate::test_util;
use crate::test_util::cleanup;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use super::host::fs::read_directory_entries;
use super::host::registration::declares_host_function;
use super::host::sql::{execute_sql, parse_sql_params, query_sql, sqlite_database_path};
use super::host::store::store_root;
use super::host_state::{resolve_sandboxed, resolve_storage_key, HostState, SandboxRoot};

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

/// Идентификатор тестового extension-плагина.
const TEST_PLUGIN_ID: &str = "aaaaaaaa-0000-4000-8000-000000000001";
/// Идентификатор плагина-провайдера capability.
const PROVIDER_ID: &str = "aaaaaaaa-0000-4000-8000-000000000002";
/// Идентификатор base-плагина с декларацией настроек.
const NOTIFICATIONS_ID: &str = "313fbeb9-8537-48bc-bb5f-5296e7b1c81e";
/// Идентификатор тестового base-плагина.
const BASE_ID: &str = "aaaaaaaa-0000-4000-8000-000000000007";

/// Манифест плагина-расширения под контракт v3.
const MANIFEST_JSON: &str = r#"{
    "contract_version": 1,
    "id": "aaaaaaaa-0000-4000-8000-000000000001",
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
        .invoke(TEST_PLUGIN_ID, "привет")
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
    let sandbox_root = Arc::new(Mutex::new(SandboxRoot::new(root.clone())));

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
    let sandbox_root = Arc::new(Mutex::new(SandboxRoot::new(root)));

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
    let mut runtime = PluginRuntime::empty();
    runtime.set_storage_root(root.clone());
    let state = runtime.roots.host_state(TEST_PLUGIN_ID);

    assert!(resolve_storage_key(&state, "state.json").is_ok());
    assert!(resolve_storage_key(&state, "nested/state.json").is_err());
    assert!(resolve_storage_key(&state, "../state.json").is_err());
    assert!(resolve_storage_key(&state, "/tmp/state.json").is_err());

    cleanup(&root);
}

/// Манифест плагина, предоставляющего capability.
const MANIFEST_WITH_CAPABILITY: &str = r#"{
    "contract_version": 1,
    "id": "aaaaaaaa-0000-4000-8000-000000000002",
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
        Some(PROVIDER_ID.to_string())
    );
    let output = runtime
        .invoke_capability("test.capability@1", "ping", serde_json::json!({}))
        .expect("маршрутизация операции");
    assert_eq!(output, "", "провайдер вызван");
    cleanup(&root);
}

/// Манифест плагина с декларацией настроек.
const MANIFEST_WITH_SETTINGS: &str = r#"{
    "contract_version": 1,
    "kind": "base",
    "id": "313fbeb9-8537-48bc-bb5f-5296e7b1c81e",
    "name": "notifications",
    "description": "Уведомления",
    "module": "plugin.wasm",
    "export": "invoke",
    "host_functions": [],
    "settings": {
      "title": "Уведомления",
      "sections": [ { "id": "notifications", "title": "Журнал" } ]
    }
  }"#;

#[test]
fn reports_settings_sources_only_for_declared_plugins() {
    let dir = setup_plugins_root(
        "settings-source",
        &compile_wat(WAT_WITH_INVOKE),
        MANIFEST_WITH_SETTINGS,
    );
    let root = dir.clone();
    let runtime = PluginRuntime::load(&[dir], root.clone()).expect("загрузка runtime");

    let sources = runtime.settings_sources();
    assert_eq!(sources.len(), 1, "декларация настроек собрана");
    assert_eq!(sources[0]["owner"], NOTIFICATIONS_ID);
    assert_eq!(sources[0]["kind"], "base");
    assert_eq!(sources[0]["schema"]["sections"][0]["id"], "notifications");
    cleanup(&root);
}

#[test]
fn settings_sources_skips_plugins_without_declaration() {
    let dir = setup_plugins_root(
        "settings-absent",
        &compile_wat(WAT_WITH_INVOKE),
        MANIFEST_JSON,
    );
    let root = dir.clone();
    let runtime = PluginRuntime::load(&[dir], root.clone()).expect("загрузка runtime");
    assert!(
        runtime.settings_sources().is_empty(),
        "плагин без декларации не попадает в источники настроек"
    );
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

/// Манифест плагина, объявившего привилегированную host-функцию стора.
const MANIFEST_STORE_DECLARED: &str = r#"{
    "contract_version": 1,
    "id": "aaaaaaaa-0000-4000-8000-000000000005",
    "name": "test-plugin",
    "description": "Тестовый плагин стора",
    "module": "plugin.wasm",
    "export": "invoke",
    "host_functions": ["store_installed"]
  }"#;

/// Манифест плагина без объявления привилегированной host-функции.
const MANIFEST_STORE_UNDECLARED: &str = r#"{
    "contract_version": 1,
    "id": "aaaaaaaa-0000-4000-8000-000000000005",
    "name": "test-plugin",
    "description": "Тестовый плагин без стора",
    "module": "plugin.wasm",
    "export": "invoke",
    "host_functions": []
  }"#;

#[test]
fn store_function_linked_only_when_declared() {
    let declared: PluginManifest = serde_json::from_str(MANIFEST_STORE_DECLARED).expect("манифест");
    let undeclared: PluginManifest =
        serde_json::from_str(MANIFEST_STORE_UNDECLARED).expect("манифест");
    assert!(
        declares_host_function(&declared, HOST_STORE_INSTALLED),
        "объявленная host-функция включает регистрацию"
    );
    for function in STORE_HOST_FUNCTIONS {
        assert!(
            !declares_host_function(&undeclared, function),
            "без объявления привилегированная host-функция {function} не регистрируется"
        );
    }
}

#[test]
fn plugin_store_root_reaches_host_state() {
    let dir = test_util::test_root("plugin-runtime-store-root");
    let mut runtime = PluginRuntime::empty();
    runtime.set_plugin_store_root(dir.clone());
    let state = runtime.roots.host_state(TEST_PLUGIN_ID);
    let resolved = store_root(&state).expect("корень стора доступен");
    assert_eq!(resolved, dir, "корень доходит до host-функций стора");
    cleanup(&dir);
}

#[test]
fn plugin_store_root_absent_without_configuration() {
    let runtime = PluginRuntime::empty();
    let state = runtime.roots.host_state(TEST_PLUGIN_ID);
    assert!(
        store_root(&state).is_err(),
        "без настройки корень стора недоступен"
    );
}

/// Манифест плагина, предоставляющего capability пользовательского плагина.
const MANIFEST_CAP_USER: &str = r#"{
    "contract_version": 1,
    "id": "aaaaaaaa-0000-4000-8000-000000000006",
    "name": "test-plugin",
    "description": "Пользовательский плагин",
    "module": "plugin.wasm",
    "export": "invoke",
    "host_functions": [],
    "provides": ["user.cap@1"]
  }"#;

/// Манифест поставляемого плагина с тем же идентификатором и другой capability.
const MANIFEST_CAP_BUNDLED: &str = r#"{
    "contract_version": 1,
    "id": "aaaaaaaa-0000-4000-8000-000000000006",
    "name": "test-plugin",
    "description": "Поставляемый плагин",
    "module": "plugin.wasm",
    "export": "invoke",
    "host_functions": [],
    "provides": ["bundled.cap@1"]
  }"#;

#[test]
fn earlier_directory_wins_on_id_conflict() {
    let user = setup_plugins_root(
        "conflict-user",
        &compile_wat(WAT_WITH_INVOKE),
        MANIFEST_CAP_USER,
    );
    let bundled = setup_plugins_root(
        "conflict-bundled",
        &compile_wat(WAT_WITH_INVOKE),
        MANIFEST_CAP_BUNDLED,
    );
    let root = user.clone();
    let runtime =
        PluginRuntime::load(&[user.clone(), bundled.clone()], root).expect("загрузка runtime");
    assert_eq!(
        runtime.plugin_names(),
        vec!["test-plugin"],
        "одноимённый плагин загружается один раз"
    );
    assert!(
        runtime.plugin_providing("user.cap@1").is_some(),
        "побеждает плагин из более приоритетной директории"
    );
    assert!(
        runtime.plugin_providing("bundled.cap@1").is_none(),
        "менее приоритетный одноимённый плагин не загружается"
    );
    cleanup(&user);
    cleanup(&bundled);
}

/// Манифест базового плагина для проверки фильтра активности.
const MANIFEST_BASE: &str = r#"{
    "contract_version": 1,
    "kind": "base",
    "id": "aaaaaaaa-0000-4000-8000-000000000007",
    "name": "test-plugin",
    "description": "Тестовый базовый плагин",
    "module": "plugin.wasm",
    "export": "invoke",
    "host_functions": []
  }"#;

#[test]
fn disabled_plugin_is_skipped() {
    let dir = setup_plugins_root("disabled", &compile_wat(WAT_WITH_INVOKE), MANIFEST_JSON);
    let root = dir.clone();

    let runtime = PluginRuntime::load_filtered(
        std::slice::from_ref(&dir),
        root.clone(),
        None,
        &[TEST_PLUGIN_ID.to_string()],
        None,
    )
    .expect("загрузка runtime");

    assert!(
        runtime.plugin_names().is_empty(),
        "отключённый плагин не загружается"
    );
    cleanup(&root);
}

#[test]
fn disabled_base_plugin_still_loads() {
    let dir = setup_plugins_root(
        "disabled-base",
        &compile_wat(WAT_WITH_INVOKE),
        MANIFEST_BASE,
    );
    let root = dir.clone();

    let runtime = PluginRuntime::load_filtered(
        std::slice::from_ref(&dir),
        root.clone(),
        None,
        &[BASE_ID.to_string()],
        None,
    )
    .expect("загрузка runtime");

    assert_eq!(
        runtime.plugin_names(),
        vec!["test-plugin"],
        "базовый плагин загружается несмотря на реестр"
    );
    cleanup(&root);
}

#[test]
fn load_publishes_info_event() {
    let dir = setup_plugins_root("load-event", &compile_wat(WAT_WITH_INVOKE), MANIFEST_JSON);
    let root = dir.clone();
    let _ = get_bus().drain();

    let runtime = PluginRuntime::load(&[dir], root.clone()).expect("загрузка runtime");

    let events = get_bus().drain();
    let event = events
        .iter()
        .find(|event| event.details["id"] == TEST_PLUGIN_ID)
        .expect("событие загрузки плагина");
    assert_eq!(event.level, "technical");
    assert_eq!(event.severity, Severity::Info);
    assert_eq!(event.details["name"], "test-plugin");
    assert_eq!(event.details["kind"], "extension");

    drop(runtime);
    cleanup(&root);
}

#[test]
fn skipped_plugin_publishes_warn() {
    let dir = setup_plugins_root("skip-warn", &compile_wat(WAT_WITHOUT_INVOKE), MANIFEST_JSON);
    let root = dir.clone();
    let _ = get_bus().drain();

    let runtime = PluginRuntime::load(&[dir], root.clone()).expect("загрузка runtime");

    assert!(runtime.plugin_names().is_empty(), "плагин отбракован");
    let events = get_bus().drain();
    assert!(
        events
            .iter()
            .any(|event| event.severity == Severity::Warn && event.message.contains("пропущен")),
        "пропуск плагина даёт предупреждение"
    );
    cleanup(&root);
}

#[test]
fn invoke_publishes_trace_event() {
    let dir = setup_plugins_root("trace", &compile_wat(WAT_WITH_INVOKE), MANIFEST_JSON);
    let root = dir.clone();
    let mut runtime = PluginRuntime::load(&[dir], root.clone()).expect("загрузка runtime");
    set_log_level(Severity::Trace);
    let _ = get_bus().drain();

    runtime
        .invoke(TEST_PLUGIN_ID, "ping")
        .expect("вызов плагина");

    let events = get_bus().drain();
    let trace = events
        .iter()
        .find(|event| event.severity == Severity::Trace)
        .expect("трассировочное событие");
    assert_eq!(trace.details["operation"], "invoke");
    assert_eq!(trace.details["ok"], true);
    assert_eq!(trace.details["request"], "ping");
    set_log_level(Severity::Info);
    cleanup(&root);
}

#[test]
fn trace_suppressed_at_info_threshold() {
    let dir = setup_plugins_root("trace-off", &compile_wat(WAT_WITH_INVOKE), MANIFEST_JSON);
    let root = dir.clone();
    let mut runtime = PluginRuntime::load(&[dir], root.clone()).expect("загрузка runtime");
    set_log_level(Severity::Info);
    let _ = get_bus().drain();

    runtime
        .invoke(TEST_PLUGIN_ID, "ping")
        .expect("вызов плагина");

    let events = get_bus().drain();
    assert!(
        !events.iter().any(|event| event.severity == Severity::Trace),
        "при пороге info трасса не публикуется"
    );
    cleanup(&root);
}

/// Создание host-состояния для проверок SQL-хранилища.
fn sqlite_host_state(storage: PathBuf, sandbox: PathBuf, plugin_id: &str) -> HostState {
    let mut runtime = PluginRuntime::empty();
    runtime.set_storage_root(storage);
    let state = runtime.roots.host_state(plugin_id);
    *state.roots.sandbox_root.lock().expect("песочный корень") = SandboxRoot::new(sandbox);
    state
}

#[test]
fn sql_database_path_is_isolated_per_library() {
    let root = test_util::test_root("plugin-sql-path");
    cleanup(&root);
    fs::create_dir_all(root.join("library-a")).expect("папка A");
    fs::create_dir_all(root.join("library-b")).expect("папка B");
    let storage = root.join("state");

    let first = sqlite_host_state(storage.clone(), root.join("library-a"), TEST_PLUGIN_ID);
    let second = sqlite_host_state(storage, root.join("library-b"), TEST_PLUGIN_ID);
    let first_path = sqlite_database_path(&first).expect("путь A");
    let second_path = sqlite_database_path(&second).expect("путь B");

    assert_ne!(first_path, second_path, "библиотеки получают разные базы");
    assert!(
        first_path.starts_with(storage_path(&first)),
        "база лежит в служебной области"
    );
    assert!(
        first_path.to_string_lossy().contains(TEST_PLUGIN_ID),
        "путь содержит идентификатор провайдера"
    );
    cleanup(&root);
}

/// Корень служебного хранилища host-состояния.
fn storage_path(state: &HostState) -> PathBuf {
    state
        .roots
        .storage_root
        .lock()
        .expect("storage")
        .clone()
        .expect("storage настроен")
}

#[test]
fn sql_requires_configured_storage() {
    let runtime = PluginRuntime::empty();
    let state = runtime.roots.host_state(TEST_PLUGIN_ID);
    assert!(
        sqlite_database_path(&state).is_err(),
        "без служебного хранилища SQL недоступен"
    );
}

#[test]
fn sql_execute_and_query_roundtrip() {
    let root = test_util::test_root("plugin-sql-roundtrip");
    cleanup(&root);
    let library = root.join("library");
    fs::create_dir_all(&library).expect("библиотека");
    let state = sqlite_host_state(root.join("state"), library, TEST_PLUGIN_ID);

    execute_sql(
        &state,
        "CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT, size INTEGER)",
        Vec::new(),
    )
    .expect("создание таблицы");
    execute_sql(
        &state,
        "INSERT INTO books (title, size) VALUES (?1, ?2)",
        vec![
            rusqlite::types::Value::Text("Книга".to_string()),
            rusqlite::types::Value::Integer(42),
        ],
    )
    .expect("вставка");

    let rows = query_sql(&state, "SELECT title, size FROM books", Vec::new()).expect("запрос");
    assert_eq!(rows.len(), 1, "одна строка");
    assert_eq!(rows[0]["title"], "Книга");
    assert_eq!(rows[0]["size"], 42);
    cleanup(&root);
}

#[test]
fn sql_error_is_reported() {
    let root = test_util::test_root("plugin-sql-error");
    cleanup(&root);
    let library = root.join("library");
    fs::create_dir_all(&library).expect("библиотека");
    let state = sqlite_host_state(root.join("state"), library, TEST_PLUGIN_ID);

    let result = query_sql(&state, "SELECT * FROM no_such_table", Vec::new());
    assert!(result.is_err(), "ошибка SQL возвращается плагину");
    cleanup(&root);
}

#[test]
fn sql_libraries_do_not_share_data() {
    let root = test_util::test_root("plugin-sql-isolation");
    cleanup(&root);
    let library_a = root.join("library-a");
    let library_b = root.join("library-b");
    fs::create_dir_all(&library_a).expect("библиотека A");
    fs::create_dir_all(&library_b).expect("библиотека B");
    let storage = root.join("state");

    let first = sqlite_host_state(storage.clone(), library_a, TEST_PLUGIN_ID);
    let second = sqlite_host_state(storage, library_b, TEST_PLUGIN_ID);
    execute_sql(
        &first,
        "CREATE TABLE t (value TEXT); INSERT INTO t VALUES ('a')",
        Vec::new(),
    )
    .expect("заполнение A");
    execute_sql(
        &second,
        "CREATE TABLE t (value TEXT); INSERT INTO t VALUES ('b')",
        Vec::new(),
    )
    .expect("заполнение B");

    let rows_a = query_sql(&first, "SELECT value FROM t", Vec::new()).expect("A");
    let rows_b = query_sql(&second, "SELECT value FROM t", Vec::new()).expect("B");
    assert_eq!(rows_a[0]["value"], "a");
    assert_eq!(rows_b[0]["value"], "b");
    cleanup(&root);
}

#[test]
fn parses_sql_params_from_json() {
    let params = parse_sql_params(r#"[1, "текст", 1.5, null, true]"#).expect("разбор");
    assert_eq!(params.len(), 5);
    assert_eq!(params[0], rusqlite::types::Value::Integer(1));
    assert_eq!(params[1], rusqlite::types::Value::Text("текст".to_string()));
    assert_eq!(params[2], rusqlite::types::Value::Real(1.5));
    assert_eq!(params[3], rusqlite::types::Value::Null);
    assert_eq!(params[4], rusqlite::types::Value::Integer(1));
    assert!(parse_sql_params("{}").is_err(), "не-массив отклоняется");
}

#[test]
fn directory_entries_include_file_metadata() {
    let root = test_util::test_root("plugin-fs-metadata");
    cleanup(&root);
    fs::create_dir_all(root.join("sub")).expect("подпапка");
    fs::write(root.join("book.epub"), vec![0u8; 10]).expect("файл");

    let entries = read_directory_entries(&root);
    let file = entries
        .iter()
        .find(|entry| entry.name == "book.epub")
        .expect("файл в списке");
    assert_eq!(file.kind, "file");
    assert_eq!(file.size, Some(10), "размер файла без чтения содержимого");
    assert!(file.mtime_ms.is_some(), "время изменения файла доступно");

    let dir = entries
        .iter()
        .find(|entry| entry.name == "sub")
        .expect("каталог в списке");
    assert_eq!(dir.kind, "dir");
    assert!(dir.size.is_none(), "у каталога нет размера файла");
    assert!(dir.mtime_ms.is_none(), "у каталога нет времени изменения");
    cleanup(&root);
}

/// Снимок скомпилированных файлов кэша: путь и время изменения.
///
/// Служебные `.stats`-файлы wasmtime исключаются: они обновляются и при
/// попадании в кэш, поэтому не отражают факт компиляции.
fn cache_module_snapshot(cache_root: &std::path::Path) -> Vec<(PathBuf, std::time::SystemTime)> {
    fn walk(dir: &std::path::Path, out: &mut Vec<PathBuf>) {
        let Ok(entries) = fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                walk(&path, out);
            } else if path.extension().and_then(|ext| ext.to_str()) != Some("stats") {
                out.push(path);
            }
        }
    }
    let mut files = Vec::new();
    walk(cache_root, &mut files);
    let mut snapshot: Vec<_> = files
        .into_iter()
        .filter_map(|path| {
            let modified = fs::metadata(&path).ok()?.modified().ok()?;
            Some((path, modified))
        })
        .collect();
    snapshot.sort();
    snapshot
}

#[test]
fn warm_cache_prevents_recompilation() {
    let dir = setup_plugins_root("cache-warm", &compile_wat(WAT_WITH_INVOKE), MANIFEST_JSON);
    let root = dir.clone();
    let state_root = test_util::test_root("plugin-runtime-cache-state");
    let config = crate::plugin::wasm_cache::prepare(&state_root).expect("конфигурация кэша");

    let runtime = PluginRuntime::load_filtered(
        std::slice::from_ref(&dir),
        root.clone(),
        None,
        &[],
        Some(&config),
    )
    .expect("прогрев");
    assert_eq!(runtime.plugin_names(), vec!["test-plugin"]);
    drop(runtime);

    let cache_dir = state_root.join(crate::plugin::wasm_cache::WASM_CACHE_DIR_NAME);
    let before = cache_module_snapshot(&cache_dir);
    assert!(
        !before.is_empty(),
        "прогрев записал скомпилированный модуль в постоянный кэш"
    );

    let runtime = PluginRuntime::load_filtered(
        std::slice::from_ref(&dir),
        root.clone(),
        None,
        &[],
        Some(&config),
    )
    .expect("загрузка после прогрева");
    assert_eq!(
        runtime.plugin_names(),
        vec!["test-plugin"],
        "повторная загрузка успешна"
    );
    drop(runtime);

    let after = cache_module_snapshot(&cache_dir);
    for (path, modified) in &before {
        let reused = after
            .iter()
            .find(|(candidate, _)| candidate == path)
            .map(|(_, time)| *time);
        assert_eq!(
            reused,
            Some(*modified),
            "модуль {} не перекомпилирован: файл кэша не перезаписан",
            path.display()
        );
    }

    cleanup(&root);
    cleanup(&state_root);
}

/// Идентификатор тестового плагина рабочего места.
const WORKPLACE_ID: &str = "aaaaaaaa-0000-4000-8000-000000000009";

/// Создание корня плагинов с плагином рабочего места без WASM-модуля.
fn setup_workplace_root(name: &str, viewer_file: bool) -> PathBuf {
    let dir = test_util::test_root(&format!("plugin-runtime-workplace-{name}"));
    let plugin_dir = dir.join("pdf-viewer");
    fs::create_dir_all(plugin_dir.join("viewer")).expect("создание директории плагина");
    let manifest = format!(
        r#"{{
          "contract_version": 1,
          "kind": "workplace",
          "id": "{WORKPLACE_ID}",
          "name": "pdf-viewer",
          "description": "Читалка PDF",
          "formats": ["pdf"],
          "viewer": "viewer/index.html",
          "host_functions": []
        }}"#
    );
    fs::write(plugin_dir.join(MANIFEST_FILE_NAME), manifest).expect("манифест");
    if viewer_file {
        fs::write(
            plugin_dir.join("viewer").join("index.html"),
            "<html></html>",
        )
        .expect("модуль рисования");
    }
    dir
}

#[test]
fn loads_workplace_plugin_without_wasm() {
    let dir = setup_workplace_root("loads", true);
    let root = dir.clone();
    let runtime = PluginRuntime::load(&[dir], root.clone()).expect("загрузка runtime");
    assert_eq!(
        runtime.workplace_plugin_ids(),
        vec![WORKPLACE_ID.to_string()]
    );
    assert_eq!(runtime.workplace_formats(), vec!["pdf".to_string()]);
    assert_eq!(
        runtime.workplace_plugin_for_format("PDF").as_deref(),
        Some(WORKPLACE_ID)
    );
    assert!(
        runtime
            .viewer_path(WORKPLACE_ID)
            .expect("путь модуля")
            .is_file(),
        "модуль рисования доступен по идентификатору"
    );
    cleanup(&root);
}

#[test]
fn workplace_viewer_dir_resolves_and_is_missing_for_unknown_plugin() {
    let dir = setup_workplace_root("viewer-dir", true);
    let root = dir.clone();
    let runtime = PluginRuntime::load(&[dir], root.clone()).expect("загрузка runtime");
    let viewer_dir = runtime.viewer_dir(WORKPLACE_ID).expect("каталог модуля");
    assert!(viewer_dir.is_dir(), "каталог модуля рисования существует");
    assert!(
        viewer_dir.join("index.html").is_file(),
        "точка входа лежит в каталоге модуля"
    );
    assert_eq!(
        runtime.viewer_dir("aaaaaaaa-0000-4000-8000-0000000000ff"),
        None,
        "для неизвестного плагина каталог модуля не резолвится"
    );
    cleanup(&root);
}

#[test]
fn skips_workplace_plugin_without_viewer_file() {
    let dir = setup_workplace_root("missing-viewer", false);
    let root = dir.clone();
    let runtime = PluginRuntime::load(&[dir], root.clone()).expect("загрузка runtime");
    assert!(
        runtime.plugin_names().is_empty(),
        "плагин рабочего места без модуля рисования не загружается"
    );
    cleanup(&root);
}

#[test]
fn workplace_plugin_is_not_selected_for_unknown_format() {
    let dir = setup_workplace_root("unknown-format", true);
    let root = dir.clone();
    let runtime = PluginRuntime::load(&[dir], root.clone()).expect("загрузка runtime");
    assert_eq!(runtime.workplace_plugin_for_format("epub"), None);
    cleanup(&root);
}
