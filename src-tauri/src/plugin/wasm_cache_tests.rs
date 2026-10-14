use super::*;
use crate::test_util;
use std::fs;

/// Создание каталога кэша с модулями заданных размеров.
///
/// Возвращает корень состояния; модули лежат в `<root>/wasm-cache/modules`.
fn setup_cache(root_name: &str, entry_count: usize, entry_size: u64) -> PathBuf {
    let root = test_util::test_root(root_name);
    let modules = root.join(WASM_CACHE_DIR_NAME).join("modules");
    fs::create_dir_all(&modules).expect("каталог модулей");
    for index in 0..entry_count {
        let entry = modules.join(format!("module-{index:04}"));
        fs::write(&entry, vec![0u8; entry_size as usize]).expect("модуль кэша");
        fs::write(entry.with_extension("stats"), b"stats").expect("статистика кэша");
    }
    root
}

/// Число файлов-модулей (без `.stats`) в каталоге кэша.
fn module_count(root: &Path) -> usize {
    let modules = root.join(WASM_CACHE_DIR_NAME).join("modules");
    fs::read_dir(&modules)
        .expect("каталог модулей")
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_file())
        .filter(|entry| entry.path().extension().and_then(|value| value.to_str()) != Some("stats"))
        .count()
}

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

/// Кэш с числом записей сверх предела очищается до разрешённого размера.
#[test]
fn cleanup_limits_entry_count() {
    let root = setup_cache("wasm-cache-count", WASM_CACHE_MAX_ENTRIES + 10, 1);
    let original = module_count(&root);
    assert!(
        original > WASM_CACHE_MAX_ENTRIES,
        "подготовлено больше записей, чем предел: {original}"
    );

    cleanup(&root.join(WASM_CACHE_DIR_NAME));

    let remaining = module_count(&root);
    assert!(
        remaining <= WASM_CACHE_MAX_ENTRIES,
        "после очистки записей не больше предела: {remaining}"
    );
    test_util::cleanup(&root);
}

/// Кэш сверх предела по размеру очищается до разрешённого объёма.
#[test]
fn cleanup_limits_total_bytes() {
    // 5 модулей по 100 МиБ — заведомо больше предела 256 МиБ.
    let entry_size = 100 * 1024 * 1024;
    let root = setup_cache("wasm-cache-bytes", 5, entry_size);

    cleanup(&root.join(WASM_CACHE_DIR_NAME));

    let modules = root.join(WASM_CACHE_DIR_NAME).join("modules");
    let total: u64 = fs::read_dir(&modules)
        .expect("каталог модулей")
        .filter_map(Result::ok)
        .filter(|entry| entry.path().extension().and_then(|value| value.to_str()) != Some("stats"))
        .filter_map(|entry| entry.metadata().ok())
        .map(|metadata| metadata.len())
        .sum();
    assert!(
        total <= WASM_CACHE_MAX_BYTES,
        "после очистки объём не больше предела: {total}"
    );
    test_util::cleanup(&root);
}

/// Очистка не трогает свежие записи, укладывающиеся в предел.
#[test]
fn cleanup_keeps_entries_within_limits() {
    let root = setup_cache("wasm-cache-keep", 3, 1024);
    let before = module_count(&root);

    cleanup(&root.join(WASM_CACHE_DIR_NAME));

    assert_eq!(
        module_count(&root),
        before,
        "записи в пределах предела сохранены"
    );
    test_util::cleanup(&root);
}

/// Отсутствие каталога модулей не прерывает очистку.
#[test]
fn cleanup_missing_modules_is_safe() {
    let root = test_util::test_root("wasm-cache-missing");
    cleanup(&root.join(WASM_CACHE_DIR_NAME));
    test_util::cleanup(&root);
}

/// Ошибка очистки (модуль — каталог вместо файла) не паникует.
#[test]
fn cleanup_failure_is_not_fatal() {
    let root = test_util::test_root("wasm-cache-failure");
    let modules = root.join(WASM_CACHE_DIR_NAME).join("modules");
    fs::create_dir_all(modules.join("module-as-dir")).expect("каталог вместо модуля");

    // Вызов не должен паниковать и не обязан удалить нестандартную запись.
    cleanup(&root.join(WASM_CACHE_DIR_NAME));

    test_util::cleanup(&root);
}
