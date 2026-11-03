//! События плагинов и запись их в журнал диагностики.
//!
//! Плагины сообщают о происходящем через host-функции `log`/`notify`, а
//! приложение пишет эти сообщения в файловый журнал диагностики. Отдельной
//! ленты уведомлений в интерфейсе нет: пользователь читает не события
//! приложения, а книгу, а разбор сбоя идёт по файлу, который прикладывается к
//! отчёту.

use std::sync::atomic::{AtomicU8, Ordering};

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

/// Приёмник событий плагинов.
///
/// Буфера в памяти нет: событие — это строка журнала диагностики, и живёт оно
/// сразу в файле. Так отчёт поддержки всегда полон, а память не растёт вместе с
/// числом событий.
#[derive(Clone, Copy, Default)]
pub struct EventBus;

impl EventBus {
    /// Создание приёмника событий.
    pub fn new() -> Self {
        Self
    }

    /// Запись события в журнал диагностики.
    ///
    /// Записывается всё, что сообщил код: подробность не настраивается, потому
    /// что решать это — не дело пользователя. Трассу вызовов плагинов пишет
    /// только явно включённая отладка сборки.
    pub fn publish(
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
}

/// Глобальный приёмник событий плагинов.
static GLOBAL_BUS: std::sync::OnceLock<EventBus> = std::sync::OnceLock::new();

/// Возврат глобального приёмника событий.
pub fn get_bus() -> &'static EventBus {
    GLOBAL_BUS.get_or_init(EventBus::new)
}

#[cfg(test)]
#[path = "bus_tests.rs"]
mod tests;
