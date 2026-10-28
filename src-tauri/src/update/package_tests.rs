use super::*;
use crate::test_util;
use std::io::Write;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

/// Запись zip-пакета с указанными файлами.
fn write_zip(path: &Path, entries: &[(&str, &[u8])]) {
    let file = File::create(path).expect("создание пакета");
    let mut zip = ZipWriter::new(file);
    for (name, bytes) in entries {
        zip.start_file(*name, SimpleFileOptions::default())
            .expect("запись файла");
        zip.write_all(bytes).expect("данные файла");
    }
    zip.finish().expect("завершение пакета");
}

#[test]
fn extracts_safe_package() {
    let root = test_util::test_root("update-package-extract");
    let archive = root.join("update.zip");
    write_zip(
        &archive,
        &[
            ("context", b"binary"),
            ("base-plugins/notifications/plugin-manifest.json", b"{}"),
        ],
    );
    let destination = root.join("payload");

    extract_package(&archive, &destination).expect("распаковка");
    assert_eq!(
        fs::read(destination.join("context")).expect("файл приложения"),
        b"binary"
    );
    assert!(destination
        .join("base-plugins/notifications/plugin-manifest.json")
        .is_file());
    test_util::cleanup(&root);
}

#[test]
fn rejects_zip_slip() {
    let root = test_util::test_root("update-package-slip");
    let archive = root.join("update.zip");
    write_zip(&archive, &[("context", b"binary"), ("../escape", b"x")]);
    let destination = root.join("payload");

    assert!(extract_package(&archive, &destination).is_err());
    assert!(!root.join("escape").exists());
    test_util::cleanup(&root);
}

#[test]
fn rejects_empty_package() {
    let root = test_util::test_root("update-package-empty");
    let archive = root.join("update.zip");
    write_zip(&archive, &[]);
    let destination = root.join("payload");

    assert!(extract_package(&archive, &destination).is_err());
    test_util::cleanup(&root);
}

#[test]
fn verifies_sha256() {
    let root = test_util::test_root("update-package-hash");
    let file = root.join("artifact");
    fs::write(&file, b"context").expect("файл");
    let hash = sha256_of(&file).expect("хеш");
    assert_eq!(hash.len(), 64, "хеш SHA-256 в hex");
    assert!(hash.chars().all(|value| value.is_ascii_hexdigit()));

    verify_sha256(&file, Some(&hash), true).expect("сумма совпадает");
    assert!(verify_sha256(&file, Some("00"), true).is_err());
    test_util::cleanup(&root);
}

#[test]
fn requires_hash_for_network_artifact() {
    let root = test_util::test_root("update-package-hash-required");
    let file = root.join("artifact");
    fs::write(&file, b"context").expect("файл");

    assert!(verify_sha256(&file, None, true).is_err());
    verify_sha256(&file, None, false).expect("для файла сумма необязательна");
    test_util::cleanup(&root);
}

#[test]
fn install_target_is_executable_directory() {
    let path = PathBuf::from("/opt/context/context");
    assert_eq!(install_target(&path), PathBuf::from("/opt/context"));
}
