use std::path::Path;

use super::*;
use crate::test_util;

/// Создание директории плагина с манифестом заданной категории.
fn write_manifest(directory: &Path, name: &str, kind: &str) {
    let plugin_dir = directory.join(name);
    std::fs::create_dir_all(&plugin_dir).expect("директория плагина");
    std::fs::write(
        plugin_dir.join(MANIFEST_FILE_NAME),
        format!(
            r#"{{"contract_version":1,"kind":"{kind}","name":"{name}","description":"d","module":"p.wasm","export":"invoke","host_functions":[]}}"#
        ),
    )
    .expect("манифест");
}

#[test]
fn discovers_only_source_plugins() {
    let dir = test_util::test_root("plugin-discovery");
    write_manifest(&dir, "library", "source");
    write_manifest(&dir, "calibre", "source");
    write_manifest(&dir, "settings", "base");

    let names = discover_source_plugins(std::slice::from_ref(&dir));

    assert_eq!(names, vec!["calibre", "library"]);
    test_util::cleanup(&dir);
}

#[test]
fn missing_directory_is_skipped() {
    let dir = test_util::test_root("plugin-discovery-missing");

    let names = discover_source_plugins(&[dir.join("no-such-dir")]);

    assert!(names.is_empty());
    test_util::cleanup(&dir);
}
