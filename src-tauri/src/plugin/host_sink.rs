//! Приёмник сообщений плагинов.

use std::sync::{Arc, Mutex};

/// Приёмник сообщений плагинов, приходящих через host-функцию `log`.
#[derive(Clone, Default)]
pub struct HostSink {
    inner: Arc<Mutex<Vec<String>>>,
}

impl HostSink {
    /// Создание нового приёмника сообщений.
    pub fn new() -> Self {
        Self::default()
    }

    /// Сохранение сообщения, полученного от плагина.
    pub fn push(&self, message: &str) {
        if let Ok(mut logs) = self.inner.lock() {
            logs.push(message.to_string());
        }
    }

    /// Получение всех сохранённых сообщений.
    pub fn drain(&self) -> Vec<String> {
        self.inner
            .lock()
            .map(|mut logs| std::mem::take(&mut *logs))
            .unwrap_or_default()
    }
}
