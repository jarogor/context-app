//! Общие вспомогательные функции для тестов.
//!
//! Все временные данные тестов хранятся в `_tmp/tests/` внутри рабочей
//! директории проекта. Ничего вне репозитория тесты не создают.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::{env, fs};

static COUNTER: AtomicU32 = AtomicU32::new(0);

/// Уникальная корневая директория теста
pub fn test_root(name: &str) -> PathBuf {
    let dir = env::temp_dir()
        .join(env!("CARGO_PKG_NAME"))
        .join("tests")
        .join(format!("{name}-{}", COUNTER.fetch_add(1, Ordering::SeqCst)));

    reset(&dir);

    dir
}

/// Очистка и создание директории.
pub fn reset(dir: &Path) {
    if dir.exists() {
        fs::remove_dir_all(dir).expect("очистка временной директории");
    }
    fs::create_dir_all(dir).expect("создание временной директории");
}

/// Удаление директории вместе с содержимым.
pub fn cleanup(dir: &Path) {
    if dir.exists() {
        fs::remove_dir_all(dir).expect("очистка временной директории");
    }
}
