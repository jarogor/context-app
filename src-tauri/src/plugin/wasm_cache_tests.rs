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

/// Создание каталога компилятора с модулями заданных имён.
fn write_compiler_dir(modules: &Path, name: &str, module_names: &[&str]) {
    let dir = modules.join(name);
    fs::create_dir_all(&dir).expect("каталог компилятора");
    for module in module_names {
        fs::write(dir.join(module), vec![0u8; 16]).expect("модуль");
        fs::write(dir.join(format!("{module}.stats")), b"stats").expect("статистика");
    }
}

/// Копии модулей из прежних сборок удаляются: остаётся самый свежий каталог.
///
/// В отладочной сборке имя каталога компилятора включает время изменения
/// исполняемого файла, поэтому каждая пересборка даёт новый каталог с тем же
/// набором модулей. Копии не нужны: wasmtime читает свежий каталог.
#[test]
fn prune_keeps_one_copy_per_module() {
    let root = test_util::test_root("wasm-cache-prune");
    let modules = root.join(WASM_CACHE_DIR_NAME).join("modules");
    fs::create_dir_all(&modules).expect("каталог модулей");

    write_compiler_dir(&modules, "wasmtime--1", &["aaa", "bbb"]);
    write_compiler_dir(&modules, "wasmtime--2", &["aaa", "bbb"]);
    write_compiler_dir(&modules, "wasmtime--3", &["aaa", "bbb"]);
    // Свежий каталог — с самым поздним временем изменения.
    let newest = modules.join("wasmtime--3");
    let later = std::time::SystemTime::now() + std::time::Duration::from_secs(60);
    fs::File::options()
        .write(true)
        .open(newest.join("aaa"))
        .and_then(|file| file.set_modified(later))
        .expect("время изменения");

    prune(&root.join(WASM_CACHE_DIR_NAME));

    let remaining: Vec<String> = fs::read_dir(&modules)
        .expect("каталог модулей")
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_dir())
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .collect();
    assert_eq!(
        remaining,
        vec!["wasmtime--3".to_string()],
        "остался только свежий каталог: {remaining:?}"
    );
    assert!(
        newest.join("aaa").is_file(),
        "модуль свежего каталога на месте"
    );

    test_util::cleanup(&root);
}

/// Единственный каталог компилятора не трогается: это и есть рабочая копия.
#[test]
fn prune_keeps_single_compiler_dir() {
    let root = test_util::test_root("wasm-cache-single");
    let modules = root.join(WASM_CACHE_DIR_NAME).join("modules");
    fs::create_dir_all(&modules).expect("каталог модулей");
    write_compiler_dir(&modules, "wasmtime--1", &["aaa"]);

    prune(&root.join(WASM_CACHE_DIR_NAME));

    assert!(
        modules.join("wasmtime--1").join("aaa").is_file(),
        "единственный каталог не удаляется"
    );
    test_util::cleanup(&root);
}

/// Плоские копии в `modules` (старая раскладка) тоже убираются.
#[test]
fn prune_removes_flat_copies() {
    let root = test_util::test_root("wasm-cache-flat");
    let modules = root.join(WASM_CACHE_DIR_NAME).join("modules");
    fs::create_dir_all(&modules).expect("каталог модулей");
    write_compiler_dir(&modules, "wasmtime--1", &["aaa"]);
    fs::write(modules.join("aaa"), b"copy").expect("плоская копия");
    fs::write(modules.join("zzz"), b"only-here").expect("чужой модуль");

    prune(&root.join(WASM_CACHE_DIR_NAME));

    // wasmtime читает модули только из каталога компилятора: плоские файлы
    // бесполезны, поэтому удаляются все.
    assert!(
        !modules.join("aaa").is_file(),
        "копия модуля из плоской раскладки удалена"
    );
    assert!(
        !modules.join("zzz").is_file(),
        "плоский модуль не читается wasmtime и тоже удаляется"
    );
    test_util::cleanup(&root);
}

/// Отсутствие каталога модулей не прерывает очистку.
#[test]
fn prune_missing_modules_is_safe() {
    let root = test_util::test_root("wasm-cache-missing");
    prune(&root.join(WASM_CACHE_DIR_NAME));
    test_util::cleanup(&root);
}
