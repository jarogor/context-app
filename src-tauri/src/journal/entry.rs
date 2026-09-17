//! Типы данных для журнала событий.
//!
//! Определяет Entry, Level и Severity для использования в backend API и UI.

/// Уровень записи в журнале.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum Level {
    /// Пользовательский уровень (бизнес-логика).
    User,
    /// Технический уровень (отладка).
    Technical,
}

/// Степень серьёзности записи.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum Severity {
    /// Информационный уровень.
    Info,
    /// Предупреждение.
    Warn,
    /// Ошибка.
    Error,
}

/// Запись в журнале.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
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
    /// Дополнительные данные в формате JSON.
    pub details: serde_json::Value,
    /// Признак прочитанности.
    pub read: bool,
}

impl Entry {
    /// Создаёт новую запись.
    pub fn new(
        id: u64,
        _timestamp: std::time::Instant,
        level: Level,
        severity: Severity,
        message: impl Into<String>,
        source: impl Into<String>,
        details: impl Into<serde_json::Value>,
    ) -> Self {
        let now = std::time::SystemTime::now();
        let ms = now
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;
        Self {
            id,
            timestamp: ms,
            level,
            severity,
            message: message.into(),
            source: source.into(),
            details: details.into(),
            read: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_level_variants() {
        assert_eq!(Level::User, Level::User);
        assert_eq!(Level::Technical, Level::Technical);
    }

    #[test]
    fn test_severity_variants() {
        assert_eq!(Severity::Info, Severity::Info);
        assert_eq!(Severity::Warn, Severity::Warn);
        assert_eq!(Severity::Error, Severity::Error);
    }

    #[test]
    fn test_entry_creation() {
        let entry = Entry::new(
            1,
            std::time::Instant::now(),
            Level::User,
            Severity::Info,
            "Test message",
            "test_source",
            serde_json::json!({ "key": "value" }),
        );
        assert_eq!(entry.id, 1);
        assert_eq!(entry.message, "Test message");
        assert_eq!(entry.source, "test_source");
        assert!(!entry.read);
        assert!(entry.timestamp > 0);
    }

    #[test]
    fn test_entry_serialization() {
        let entry = Entry::new(
            1,
            std::time::Instant::now(),
            Level::User,
            Severity::Error,
            "Test",
            "source",
            serde_json::json!({}),
        );
        let json = serde_json::to_string(&entry).unwrap();
        assert!(json.contains("\"level\":\"User\""));
        assert!(json.contains("\"severity\":\"Error\""));
        assert!(json.contains("\"timestamp\":"));
    }

    #[test]
    fn test_entry_deserialization() {
        let json = r#"{
            "id": 1,
            "timestamp": 1704067200000,
            "level": "User",
            "severity": "Info",
            "message": "Test",
            "source": "source",
            "details": {},
            "read": false
        }"#;
        let entry: Entry = serde_json::from_str(json).unwrap();
        assert_eq!(entry.id, 1);
        assert_eq!(entry.level, Level::User);
        assert_eq!(entry.severity, Severity::Info);
        assert_eq!(entry.timestamp, 1704067200000);
    }
}
