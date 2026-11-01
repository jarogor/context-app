//! Событийный bus для передачи уведомлений от плагинов.
//!
//! Плагины публикуют события через host-функции `log`/`notify`, а app-level
//! runtime доставляет их плагину, предоставляющему capability уведомлений.
//! Bus не хранит журнал и не интерпретирует предметный смысл события.

use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

/// Степень серьёзности события: от важного к подробному.
#[derive(
    Debug,
    Clone,
    Copy,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    serde::Serialize,
    serde::Deserialize,
    Default,
)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    /// Неожиданная ошибка в критической секции.
    Error,
    /// Некритический сбой, после которого работа продолжается.
    Warn,
    /// Информационное событие.
    #[default]
    Info,
    /// Отладочная информация.
    Debug,
    /// Подробная трасса вызовов.
    Trace,
}

impl Severity {
    /// Разбор степени из строки; регистр не важен. Неизвестное значение — `None`.
    pub fn parse(value: &str) -> Option<Self> {
        match value.to_ascii_lowercase().as_str() {
            "error" => Some(Self::Error),
            "warn" | "warning" => Some(Self::Warn),
            "info" => Some(Self::Info),
            "debug" => Some(Self::Debug),
            "trace" => Some(Self::Trace),
            _ => None,
        }
    }

    /// Допускает ли порог `threshold` событие этой степени.
    pub fn allows(self, threshold: Self) -> bool {
        self <= threshold
    }

    /// Числовое представление для атомарного хранения.
    fn as_u8(self) -> u8 {
        self as u8
    }

    /// Восстановление степени из числового представления.
    fn from_u8(value: u8) -> Self {
        match value {
            0 => Self::Error,
            1 => Self::Warn,
            2 => Self::Info,
            3 => Self::Debug,
            _ => Self::Trace,
        }
    }
}

/// Текущий порог логирования технических событий.
static LOG_LEVEL: AtomicU8 = AtomicU8::new(Severity::Info as u8);

/// Текущий порог логирования технических событий.
pub fn log_level() -> Severity {
    Severity::from_u8(LOG_LEVEL.load(Ordering::Relaxed))
}

/// Установка порога логирования технических событий.
pub fn set_log_level(severity: Severity) {
    LOG_LEVEL.store(severity.as_u8(), Ordering::Relaxed);
}

/// Событие, опубликованное плагином для системы уведомлений.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct PluginEvent {
    /// Канал события: `user` для уведомлений пользователю или `technical` для диагностики.
    pub level: String,
    /// Степень серьёзности события.
    pub severity: Severity,
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

    /// Публикация события в буфер без фильтрации.
    pub fn publish(&self, event: PluginEvent) {
        if let Ok(mut events) = self.inner.lock() {
            events.push(event);
        }
    }

    /// Запись технического события в журнал диагностики.
    ///
    /// Технические события не попадают в ленту уведомлений: пользователю они
    /// не адресованы и ничего ему не объясняют. Они пишутся в файл, из
    /// которого поддержка собирает отчёт, когда что-то не работает.
    ///
    /// Записывается всё, что сообщил код: подробность не настраивается, потому
    /// что решать это — не дело пользователя. Трассу вызовов плагинов пишет
    /// только явно включённая отладка сборки.
    pub fn publish_technical(
        &self,
        severity: Severity,
        message: impl Into<String>,
        source: impl Into<String>,
        details: serde_json::Value,
    ) {
        let message = message.into();
        let source = source.into();
        crate::plugin::diagnostics::record(severity, &message, &source, &details);
    }

    /// Публикация пользовательского события без учёта порога логирования.
    pub fn publish_user(
        &self,
        severity: Severity,
        message: impl Into<String>,
        source: impl Into<String>,
        details: serde_json::Value,
    ) {
        self.publish(PluginEvent {
            level: "user".to_string(),
            severity,
            message: message.into(),
            source: source.into(),
            details,
        });
    }

    /// Извлечение всех накопленных событий.
    pub fn drain(&self) -> Vec<PluginEvent> {
        self.inner
            .lock()
            .map(|mut events| std::mem::take(&mut *events))
            .unwrap_or_default()
    }

    /// Проверка отсутствия накопленных событий.
    #[cfg(test)]
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
