//! Тесты фоновой компиляции runtime чтения на старте приложения.

use super::*;
use crate::plugin::app_state::ReaderConfig;
use crate::test_util;
use crate::test_util::cleanup;
use std::fs;
use std::path::PathBuf;

/// Идентификатор тестового плагина рабочего места.
const WORKPLACE_ID: &str = "aaaaaaaa-0000-4000-8000-000000000009";

/// Создание корня плагинов с плагином рабочего места без WASM.
fn setup_reader_root(name: &str) -> PathBuf {
    let dir = test_util::test_root(&format!("reader-warmup-{name}"));
    let plugin_dir = dir.join("pdf-viewer");
    fs::create_dir_all(plugin_dir.join("viewer")).expect("директория плагина");
    fs::write(
        plugin_dir.join("plugin-manifest.json"),
        format!(
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
        ),
    )
    .expect("манифест");
    fs::write(
        plugin_dir.join("viewer").join("index.html"),
        "<html></html>",
    )
    .expect("модуль рисования");
    dir
}

/// Фоновый прогрев отдаёт готовый runtime чтения.
#[test]
fn spawn_reader_warmup_builds_runtime() {
    let root = setup_reader_root("builds");
    let config = ReaderConfig {
        directories: vec![root.clone()],
        disabled: Vec::new(),
        storage_root: root.clone(),
        cache: None,
    };

    let shared = spawn_reader_warmup(config);

    let formats = shared
        .with_ready(|runtime| runtime.workplace_formats())
        .expect("прогрев завершился");
    assert_eq!(formats, vec!["pdf".to_string()]);

    cleanup(&root);
}

/// Повторное ожидание переиспользует готовый runtime без новой сборки.
#[test]
fn reader_warmup_result_is_reused() {
    let root = setup_reader_root("reuse");
    let config = ReaderConfig {
        directories: vec![root.clone()],
        disabled: Vec::new(),
        storage_root: root.clone(),
        cache: None,
    };
    let shared = spawn_reader_warmup(config);

    let first = shared
        .with_ready(|runtime| runtime.workplace_plugin_ids())
        .expect("первое обращение");
    let second = shared
        .with_ready(|runtime| runtime.workplace_plugin_ids())
        .expect("повторное обращение");

    assert_eq!(first, second, "runtime чтения переиспользован");
    cleanup(&root);
}

/// Ошибка сборки (нет директорий плагинов) не паникует и отдаётся как ошибка.
#[test]
fn reader_warmup_reports_errors() {
    let root = test_util::test_root("reader-warmup-missing");
    let config = ReaderConfig {
        directories: vec![root.join("absent")],
        disabled: Vec::new(),
        storage_root: root.clone(),
        cache: None,
    };

    let shared = spawn_reader_warmup(config);
    let names = shared
        .with_ready(|runtime| runtime.plugin_names())
        .expect("отсутствующие директории не прерывают сборку");
    assert!(names.is_empty(), "нет загруженных плагинов");

    cleanup(&root);
}
