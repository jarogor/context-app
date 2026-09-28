use super::*;
use crate::test_util;
use std::fs;

#[test]
fn prepares_config_with_absolute_cache_directory() {
    let root = test_util::test_root("wasm-cache-prepare");

    let config = prepare(&root).expect("конфигурация кэша");
    assert!(config.is_file(), "конфигурационный файл создан");
    let contents = fs::read_to_string(&config).expect("чтение конфигурации");
    assert!(contents.contains("[cache]"), "секция cache присутствует");
    assert!(
        contents.contains("directory = \""),
        "каталог кэша задан строкой: {contents}"
    );

    let cache_dir = root.join(WASM_CACHE_DIR_NAME);
    assert!(cache_dir.is_dir(), "каталог кэша создан");
    assert!(
        cache_dir.canonicalize().expect("канонизация").is_absolute(),
        "каталог кэша абсолютен"
    );

    test_util::cleanup(&root);
}

#[test]
fn prepare_is_idempotent() {
    let root = test_util::test_root("wasm-cache-repeat");

    let first = prepare(&root).expect("первая подготовка");
    let second = prepare(&root).expect("повторная подготовка");

    assert_eq!(first, second, "повторная подготовка возвращает тот же файл");

    test_util::cleanup(&root);
}

#[test]
fn toml_string_escapes_backslashes_and_quotes() {
    assert_eq!(
        toml_string(Path::new(r#"C:\cache\"dir""#)),
        r#""C:\\cache\\\"dir\"""#
    );
}

#[test]
fn config_directory_is_created_when_absent() {
    let root = test_util::test_root("wasm-cache-absent");
    let cache_dir = root.join(WASM_CACHE_DIR_NAME);
    assert!(!cache_dir.exists(), "каталог кэша ещё не создан");

    let _ = prepare(&root).expect("подготовка создаёт каталог");

    assert!(cache_dir.is_dir(), "каталог кэша создан при подготовке");
    test_util::cleanup(&root);
}
