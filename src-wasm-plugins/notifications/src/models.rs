//! Модели данных базового плагина уведомлений.
//!
//! Содержит только структуры и перечисления без поведенческой логики.
//! Сериализация совпадает с контрактом frontend-плагина уведомлений.

use serde::{Deserialize, Serialize};

/// Уровень записи журнала.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Level {
    /// Пользовательский уровень (бизнес-логика).
    User,
    /// Технический уровень (отладка).
    Technical,
}

/// Степень серьёзности записи.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Severity {
    /// Информационный уровень.
    Info,
    /// Предупреждение.
    Warn,
    /// Ошибка.
    Error,
}

impl Severity {
    /// Разбор степени серьёзности из строки.
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "Info" => Some(Self::Info),
            "Warn" => Some(Self::Warn),
            "Error" => Some(Self::Error),
            _ => None,
        }
    }
}

/// Запись журнала.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Entry {
    /// Уникальный идентификатор записи.
    pub id: u64,
    /// Временная метка создания записи (Unix time in milliseconds).
    pub timestamp: i64,
    /// Уровень записи.
    pub level: Level,
    /// Степень серьёзности.
    pub severity: Severity,
    /// Текстовое описание события.
    pub message: String,
    /// Источник события.
    pub source: String,
    /// Дополнительные данные.
    pub details: serde_json::Value,
    /// Признак прочитанности.
    pub read: bool,
}

/// Текущее время в миллисекундах Unix epoch.
pub(crate) fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}
