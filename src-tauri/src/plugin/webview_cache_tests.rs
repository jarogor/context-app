//! Тесты очистки устаревших данных движка webview.

use super::*;
use crate::test_util;
use std::fs;

/// Установка времени изменения файла.
fn set_age(path: &Path, age_days: u64) {
    let time = SystemTime::now() - Duration::from_secs(age_days * 86_400);
    fs::File::options()
        .write(true)
        .open(path)
        .and_then(|file| file.set_modified(time))
        .expect("время изменения");
}

#[test]
fn removes_only_old_cache_entries() {
    let root = test_util::test_root("webview-cache-age");
    let cache = root.join("WebKitCache");
    fs::create_dir_all(cache.join("Records")).expect("каталог кэша");
    let old = cache.join("Records").join("old");
    let fresh = cache.join("Records").join("fresh");
    fs::write(&old, b"old").expect("старая запись");
    fs::write(&fresh, b"fresh").expect("свежая запись");
    set_age(&old, MAX_AGE_DAYS + 1);

    prune(&root);

    assert!(!old.exists(), "старая запись удалена");
    assert!(fresh.is_file(), "свежая запись осталась");
    test_util::cleanup(&root);
}

#[test]
fn keeps_application_state_untouched() {
    // localStorage и прочее состояние приложения — не кэш: его нельзя терять.
    let root = test_util::test_root("webview-cache-state");
    let state = root.join("localstorage");
    fs::create_dir_all(&state).expect("каталог состояния");
    let file = state.join("data");
    fs::write(&file, b"state").expect("данные приложения");
    set_age(&file, MAX_AGE_DAYS + 30);

    prune(&root);

    assert!(file.is_file(), "состояние приложения не тронуто");
    test_util::cleanup(&root);
}

#[test]
fn removes_empty_cache_directories() {
    // После очистки пустые ветки кэша не нужны: они ничего не хранят.
    let root = test_util::test_root("webview-cache-empty");
    let nested = root.join("WebKitCache").join("Records").join("deep");
    fs::create_dir_all(&nested).expect("вложенный каталог");
    let file = nested.join("entry");
    fs::write(&file, b"old").expect("запись");
    set_age(&file, MAX_AGE_DAYS + 1);

    prune(&root);

    assert!(!nested.exists(), "пустой каталог удалён");
    test_util::cleanup(&root);
}

#[test]
fn missing_directory_is_safe() {
    let root = test_util::test_root("webview-cache-missing");
    prune(&root);
    test_util::cleanup(&root);
}

#[test]
fn keeps_record_with_fresh_file_inside() {
    // Каталог с хотя бы одной свежей записью остаётся: в нём есть нужное.
    let root = test_util::test_root("webview-cache-mixed");
    let dir = root.join("WebKitCache").join("mixed");
    fs::create_dir_all(&dir).expect("каталог кэша");
    let old = dir.join("old");
    let fresh = dir.join("fresh");
    fs::write(&old, b"old").expect("старая запись");
    fs::write(&fresh, b"fresh").expect("свежая запись");
    set_age(&old, MAX_AGE_DAYS + 1);

    prune(&root);

    assert!(!old.exists(), "старая запись удалена");
    assert!(fresh.is_file(), "каталог с свежей записью сохранён");
    assert!(dir.is_dir(), "каталог не удалён");
    test_util::cleanup(&root);
}
