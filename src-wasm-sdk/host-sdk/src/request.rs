//! Запрос от приложения к базовому плагину по контракту.

use serde::Deserialize;

/// Запрос от приложения по контракту.
#[derive(Deserialize)]
pub struct Request {
    /// Действие плагина.
    pub action: String,
    /// Данные операции.
    #[serde(default)]
    pub payload: serde_json::Value,
}

impl Request {
    /// Разбор запроса из JSON-строки.
    pub fn parse(input: &str) -> Result<Self, String> {
        serde_json::from_str(input).map_err(|error| error.to_string())
    }
}
