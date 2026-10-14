//! Тесты сведений о приложении.

use std::path::Path;

use super::*;

#[test]
fn builds_all_paths_from_roots() {
    let info = AppInfo::build(
        "Текстура",
        "0.1.0",
        Path::new("/data/app-state"),
        Path::new("/data/app-plugins"),
        Path::new("/res/plugins"),
        Path::new("/res/base-plugins"),
    );

    assert_eq!(info.name, "Текстура");
    assert_eq!(info.version, "0.1.0");
    let keys = info
        .paths
        .iter()
        .map(|path| path.key.as_str())
        .collect::<Vec<_>>();
    assert_eq!(
        keys,
        vec![
            "app_state",
            "webview",
            "base_plugins_state",
            "user_plugins",
            "bundled_plugins",
            "bundled_base_plugins",
            "wasm_cache",
        ]
    );
    let webview = info
        .paths
        .iter()
        .find(|path| path.key == "webview")
        .unwrap();
    assert_eq!(webview.path, "/data/app-state/webview");
    assert!(
        webview.note.contains("webview"),
        "пояснение называет назначение каталога: {}",
        webview.note
    );
    let base_state = info
        .paths
        .iter()
        .find(|path| path.key == "base_plugins_state")
        .unwrap();
    assert_eq!(base_state.path, "/data/app-state/base-plugins");
    let wasm = info
        .paths
        .iter()
        .find(|path| path.key == "wasm_cache")
        .unwrap();
    assert_eq!(wasm.path, "/data/app-state/wasm-cache");
    assert!(wasm.note.contains("wasm-cache.toml"));
}

#[test]
fn every_path_has_title_and_note() {
    let info = AppInfo::build(
        "Текстура",
        "0.1.0",
        Path::new("/data/app-state"),
        Path::new("/data/app-plugins"),
        Path::new("/res/plugins"),
        Path::new("/res/base-plugins"),
    );
    for path in &info.paths {
        assert!(!path.title.trim().is_empty(), "{}: нет названия", path.key);
        assert!(!path.note.trim().is_empty(), "{}: нет пояснения", path.key);
        assert!(!path.path.trim().is_empty(), "{}: пустой путь", path.key);
    }
}
