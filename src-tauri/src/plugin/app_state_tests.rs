//! Тесты ленивой сборки runtime базовых плагинов в состоянии приложения.

use super::*;
use crate::test_util;
use crate::test_util::cleanup;
use std::fs;

/// WAT-модуль, экспортирующий функцию `invoke`.
const WAT_WITH_INVOKE: &str = r#"
    (module
      (func (export "invoke") (result i32)
        i32.const 0))
  "#;

/// Создание директории базовых плагинов с одним плагином.
fn setup_base_plugins(name: &str) -> PathBuf {
    let dir = test_util::test_root(&format!("app-state-{name}"));
    let plugin_dir = dir.join("base-sample");
    fs::create_dir_all(&plugin_dir).expect("директория плагина");
    fs::write(
        plugin_dir.join("plugin-manifest.json"),
        r#"{
        "contract_version": 1,
        "kind": "base",
        "id": "313fbeb9-8537-48bc-bb5f-5296e7b1c81e",
        "name": "sample",
        "description": "Образец базового плагина",
        "module": "plugin.wasm",
        "export": "invoke",
        "host_functions": []
      }"#,
    )
    .expect("манифест плагина");
    fs::write(plugin_dir.join("plugin.wasm"), WAT_WITH_INVOKE).expect("модуль");
    dir
}

/// Создание состояния с заданными каталогами базовых плагинов.
fn state_with_base(name: &str, base_root: PathBuf) -> AppState {
    let app_state_root = test_util::test_root(&format!("app-state-root-{name}"));
    let session = PluginSession::idle(PathBuf::from("."), base_root.clone());
    let app_info = AppInfo::build(
        "Текстура",
        "0.1.0",
        &app_state_root,
        &app_state_root.join("plugins"),
        &app_state_root.join("resources"),
        &base_root,
    );
    let reader_config = ReaderConfig {
        directories: Vec::new(),
        disabled: Vec::new(),
        storage_root: app_state_root.clone(),
        cache: None,
    };
    let app_host_config = AppHostConfig {
        directories: vec![base_root.clone()],
        storage_root: app_state_root.join("storage"),
        user_plugins_dir: app_state_root.join("plugins"),
        activation_root: app_state_root.clone(),
        catalog_dirs: Vec::new(),
        cache: None,
    };
    AppState::new(
        session,
        app_state_root,
        app_info,
        reader_config,
        app_host_config,
    )
}

/// Runtime базовых плагинов не собирается при создании состояния.
#[test]
fn app_host_is_lazy_at_creation() {
    let base_root = setup_base_plugins("lazy");
    let state = state_with_base("lazy", base_root.clone());
    assert!(
        state.app_host.is_none(),
        "runtime базовых плагинов не должен собираться при создании"
    );
    cleanup(&base_root);
}

/// Первое обращение собирает runtime, повторное переиспользует его.
#[test]
fn app_host_loads_on_first_access() {
    let base_root = setup_base_plugins("first-access");
    let mut state = state_with_base("first-access", base_root.clone());

    let names = state
        .app_host()
        .expect("первое обращение собирает runtime")
        .plugin_names();
    assert_eq!(names, vec!["sample".to_string()], "базовый плагин загружен");

    // Повторное обращение не пересобирает runtime и не теряет плагин.
    let again = state
        .app_host()
        .expect("повторное обращение использует готовый runtime")
        .plugin_names();
    assert_eq!(again, vec!["sample".to_string()], "runtime переиспользован");

    cleanup(&base_root);
}
