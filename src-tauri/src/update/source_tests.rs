use super::*;
use crate::test_util;

#[test]
fn reads_index_from_file_source() {
    let root = test_util::test_root("update-source-file");
    fs::write(
        root.join(INDEX_FILE_NAME),
        r#"{"contract_version":1,"core":{"version":"0.2.0","platforms":{}}}"#,
    )
    .expect("индекс источника");
    let source = UpdateSource {
        kind: "file".to_string(),
        location: root.to_string_lossy().to_string(),
    };

    let index = read_index(&source).expect("чтение индекса");
    assert_eq!(index.core.expect("выпуск ядра").version, "0.2.0");
    test_util::cleanup(&root);
}

#[test]
fn rejects_index_over_limit() {
    let root = test_util::test_root("update-source-limit");
    fs::write(root.join(INDEX_FILE_NAME), "x".repeat(MAX_INDEX_BYTES + 1)).expect("индекс");
    let source = UpdateSource {
        kind: "file".to_string(),
        location: root.to_string_lossy().to_string(),
    };

    assert!(
        read_index(&source).is_err(),
        "слишком большой индекс отклоняется"
    );
    test_util::cleanup(&root);
}

#[test]
fn rejects_insecure_network_source() {
    let source = UpdateSource {
        kind: "network".to_string(),
        location: "http://example.com/updates".to_string(),
    };
    assert!(read_index(&source).is_err(), "HTTP-источник отклоняется");

    let lookalike = UpdateSource {
        kind: "network".to_string(),
        location: "http://localhost.evil/updates".to_string(),
    };
    assert!(
        read_index(&lookalike).is_err(),
        "похожий на localhost хост отклоняется"
    );
}

#[test]
fn resolves_artifact_relative_to_source() {
    let path = resolve_file("/tmp/updates", "context.zip").expect("путь артефакта");
    assert_eq!(path, PathBuf::from("/tmp/updates/context.zip"));
}

#[test]
fn rejects_escaping_artifact_path() {
    assert!(resolve_file("/tmp/updates", "../context.zip").is_err());
}
