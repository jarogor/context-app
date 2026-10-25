//! Тесты развязки замков: длинная операция источника не блокирует интерфейс.
//!
//! Сессия библиотеки живёт под собственным замком, а общий замок состояния
//! берётся только на получение сессии. Проверяется само правило: пока одна
//! операция держит сессию, короткие действия над состоянием остаются доступны.
//! Именно нарушение этого правила делало интерфейс неотзывчивым во время
//! загрузки книг: настройки ждали общий замок, занятый сканированием.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use crate::plugin::PluginSession;

/// Замок сессии не мешает читать состояние, пока операция источника идёт.
#[test]
fn длинная_операция_сессии_не_держит_общий_замок() {
    let session = Arc::new(Mutex::new(PluginSession::idle(
        std::path::PathBuf::from("."),
        std::path::PathBuf::from("."),
    )));
    // Общее состояние изображается отдельным замком: главное — что он не занят.
    let state = Arc::new(Mutex::new(0_i32));

    let scanning = {
        let session = Arc::clone(&session);
        std::thread::spawn(move || {
            let _guard = session.lock().expect("сессия доступна");
            std::thread::sleep(Duration::from_millis(300));
        })
    };

    // Пока «сканирование» держит сессию, состояние читается и пишется без задержки.
    std::thread::sleep(Duration::from_millis(50));
    let started = std::time::Instant::now();
    {
        let mut value = state.lock().expect("состояние доступно");
        *value += 1;
    }
    let waited = started.elapsed();
    assert!(
        waited < Duration::from_millis(100),
        "общий замок не должен ждать операцию сессии (ждали {waited:?})"
    );
    assert_eq!(*state.lock().expect("состояние доступно"), 1);

    scanning.join().expect("поток сканирования завершён");
}

/// Замок сессии отпускается после операции: следующая команда не ждёт вечно.
#[test]
fn замок_сессии_освобождается_после_операции() {
    let session = Arc::new(Mutex::new(PluginSession::idle(
        std::path::PathBuf::from("."),
        std::path::PathBuf::from("."),
    )));

    {
        let guard = session.lock().expect("сессия доступна");
        drop(guard);
    }

    let started = std::time::Instant::now();
    let _guard = session.lock().expect("сессия снова доступна");
    assert!(started.elapsed() < Duration::from_millis(100));
}
