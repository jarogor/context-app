//! Событийный bus для передачи уведомлений от плагинов.
//!
//! Плагины публикуют события через host-функции `log`/`notify`, а app-level
//! runtime доставляет их плагину, предоставляющему capability уведомлений.
//! Bus не хранит журнал и не интерпретирует предметный смысл события.

use std::sync::{Arc, Mutex, OnceLock};

/// Событие, опубликованное плагином для системы уведомлений.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct PluginEvent {
    /// Уровень события: `user` или `technical`.
    pub level: String,
    /// Текстовое описание события.
    pub message: String,
    /// Источник события.
    pub source: String,
    /// Дополнительные данные события.
    pub details: serde_json::Value,
}

/// Приёмник событий плагинов.
///
/// Хранит события в буфере, доступном из host-функций и app-level runtime.
#[derive(Clone, Default)]
pub struct EventBus {
    /// Общий буфер накопленных событий.
    inner: Arc<Mutex<Vec<PluginEvent>>>,
}

impl EventBus {
    /// Создание пустого bus.
    pub fn new() -> Self {
        Self::default()
    }

    /// Публикация события в буфер.
    pub fn publish(&self, event: PluginEvent) {
        if let Ok(mut events) = self.inner.lock() {
            events.push(event);
        }
    }

    /// Извлечение всех накопленных событий.
    pub fn drain(&self) -> Vec<PluginEvent> {
        self.inner
            .lock()
            .map(|mut events| std::mem::take(&mut *events))
            .unwrap_or_default()
    }

    /// Проверка отсутствия накопленных событий.
    pub fn is_empty(&self) -> bool {
        self.inner
            .lock()
            .map(|events| events.is_empty())
            .unwrap_or(true)
    }
}

/// Глобальный bus событий плагинов.
static GLOBAL_BUS: OnceLock<EventBus> = OnceLock::new();

/// Возврат глобального bus событий.
pub fn get_bus() -> &'static EventBus {
    GLOBAL_BUS.get_or_init(EventBus::new)
}

#[cfg(test)]
#[path = "bus_tests.rs"]
mod tests;
