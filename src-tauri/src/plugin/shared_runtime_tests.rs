//! Тесты разделяемого runtime с фоновой сборкой и ожиданием готовности.

use super::*;
use std::sync::Arc;

/// Ожидание готовности возвращает результат фоновой сборки.
#[test]
fn with_ready_waits_for_background_build() {
    let shared = SharedRuntime::spawn(|| Ok::<i32, String>(42));
    let value = shared.with_ready(|value| *value).expect("сборка успешна");
    assert_eq!(value, 42);
}

/// Ожидание возвращает ошибку фоновой сборки без паники.
#[test]
fn with_ready_reports_build_error() {
    let shared = SharedRuntime::spawn(|| Err::<i32, String>("нет плагинов".to_string()));
    let error = shared
        .with_ready(|value| *value)
        .expect_err("ошибка сборки возвращена");
    assert_eq!(error, "нет плагинов");
}

/// Ошибка сборки не блокирует повторное обращение.
#[test]
fn with_ready_caches_error() {
    let shared = SharedRuntime::spawn(|| Err::<i32, String>("сбой".to_string()));
    let _ = shared.with_ready(|value| *value);
    let error = shared
        .with_ready(|value| *value)
        .expect_err("ошибка сохранена");
    assert_eq!(error, "сбой");
}

/// Паника фоновой сборки превращается в ошибку, а не подвешивает ожидание.
#[test]
fn with_ready_converts_panic_to_error() {
    let shared = SharedRuntime::spawn(|| -> Result<i32, String> { panic!("сломалось") });
    let error = shared
        .with_ready(|value| *value)
        .expect_err("паника превращена в ошибку");
    assert!(!error.is_empty());
}

/// Ожидание дожидается записи результата в фоновом потоке.
#[test]
fn with_ready_sees_result_after_fulfill() {
    let shared = SharedRuntime::<i32>::pending();
    let fulfilled = Arc::clone(&shared);
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(20));
        fulfilled.fulfill(Ok(7));
    });

    let value = shared
        .with_ready(|value| *value)
        .expect("результат получен");
    assert_eq!(value, 7);
}

/// Признак готовности отражает состояние слота до и после сборки.
#[test]
fn is_ready_reports_slot_state() {
    let shared = SharedRuntime::<i32>::pending();
    assert!(!shared.is_ready(), "пустой слот не готов");

    shared.fulfill(Ok(1));
    assert!(shared.is_ready(), "после записи слот готов");
}
