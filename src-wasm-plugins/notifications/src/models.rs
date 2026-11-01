//! Модели данных базового плагина уведомлений.
//!
//! Содержит только структуры и перечисления без поведенческой логики.
//! Сериализация совпадает с контрактом frontend-плагина уведомлений.

use serde::{Deserialize, Serialize};

/// Уровень записи журнала.
///
/// Журнал хранит только пользовательские события: техническая диагностика
/// пишется ядром в файл и в ленту не попадает. Уровень оставлен в модели как
/// часть формата записи, чтобы старые файлы журнала читались без ошибки.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Level {
    /// Пользовательский уровень.
    User,
}

/// Степень серьёзности записи.
///
/// Кроме стандартных имён в нижнем регистре принимаются прежние значения
/// (`Info`, `Warn`, `Error`) — журнал сессионный и очищается при старте, но
/// сохранённый файл прошлого запуска должен читаться без ошибки.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    /// Неожиданная ошибка в критической секции.
    #[serde(alias = "Error")]
    Error,
    /// Некритический сбой, после которого работа продолжается.
    #[serde(alias = "Warn", alias = "Warning")]
    Warn,
    /// Информационное событие.
    #[default]
    #[serde(alias = "Info")]
    Info,
    /// Отладочная информация.
    #[serde(alias = "Debug")]
    Debug,
    /// Подробная трасса вызовов.
    #[serde(alias = "Trace")]
    Trace,
}

impl Severity {
    /// Разбор степени серьёзности из строки; регистр не важен.
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
