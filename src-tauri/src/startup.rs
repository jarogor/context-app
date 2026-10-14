//! Замер времени запуска приложения.
//!
//! Включается переменной окружения `TEXTURE_STARTUP_TIMING`: в этом режиме
//! этапы запуска печатаются в stderr с временем от старта процесса. По
//! умолчанию замер выключен и не влияет на работу приложения.

use std::sync::OnceLock;
use std::time::Instant;

/// Переменная окружения, включающая печать этапов запуска.
const TIMING_ENV: &str = "TEXTURE_STARTUP_TIMING";

/// Момент начала запуска процесса.
static START: OnceLock<Instant> = OnceLock::new();

/// Признак включённого замера.
fn enabled() -> bool {
    std::env::var_os(TIMING_ENV).is_some()
}

/// Отметка начала запуска процесса.
pub(crate) fn mark_start() {
    let _ = START.set(Instant::now());
}

/// Печать этапа запуска с временем от его начала.
///
/// Без включённого замера вызов безвреден и ничего не делает.
pub(crate) fn mark(stage: &str) {
    if !enabled() {
        return;
    }
    let elapsed = START.get().map(Instant::elapsed).unwrap_or_default();
    eprintln!("[startup] {stage}: {:.3}s", elapsed.as_secs_f64());
}
