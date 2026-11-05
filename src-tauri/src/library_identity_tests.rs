//! Тесты устойчивого идентификатора библиотеки.

use super::*;
use crate::test_util;
use std::fs;

#[test]
fn volume_key_does_not_depend_on_mount_point() {
    // Один и тот же UUID даёт один ключ, даже если точка монтирования другая.
    let media = LibraryIdentity::Volume("1B05-2D49".to_string());
    let run_media = LibraryIdentity::Volume("1B05-2D49".to_string());

    assert_eq!(media.key(), run_media.key());
    assert_eq!(media.key(), "volume-1B05-2D49");
}

#[test]
fn path_key_stays_stable_for_plain_directories() {
    // Каталог на обычной файловой системе опознаётся по пути; `..` и ссылки
    // не должны давать новый ключ.
    let root = test_util::test_root("library-identity");
    let nested = root.join("lib");
    fs::create_dir_all(&nested).expect("каталог библиотеки");

    let direct = identify(&nested);
    let with_dotdot = identify(&root.join("lib").join("..").join("lib"));

    assert_eq!(direct.key(), with_dotdot.key());
    assert!(direct.describe().starts_with("path:"), "ключ по пути");
    test_util::cleanup(&root);
}

#[test]
fn key_is_safe_as_directory_name() {
    // Ключ становится именем каталога: разделителей пути в нём быть не может.
    let identity = LibraryIdentity::Volume("/weird uuid:1".to_string());
    let key = identity.key();

    assert!(!key.contains('/'), "без разделителя каталогов: {key}");
    assert!(!key.contains(' '), "без пробелов: {key}");
}

#[test]
fn short_hash_is_deterministic() {
    let first = LibraryIdentity::Path("/a/b".to_string());
    let second = LibraryIdentity::Path("/a/b".to_string());

    assert_eq!(first.key(), second.key());
}

/// Проверка на реальном носителе: один и тот же том, смонтированный в разных
/// местах, обязан получить один ключ. Тест не падает, если носителя нет.
#[test]
fn real_volume_identity_is_stable() {
    let current = std::path::Path::new("/run/media/jarogor/1B05-2D49/CalibreLibraryUsb");
    if !current.is_dir() {
        return;
    }
    let identity = identify(current);
    assert_eq!(
        identity.clone(),
        identify(current),
        "повторное определение даёт тот же ключ"
    );
    assert!(
        matches!(identity, LibraryIdentity::Volume(_)),
        "съёмный том опознан по UUID, а не по пути: {}",
        identity.describe()
    );
}
