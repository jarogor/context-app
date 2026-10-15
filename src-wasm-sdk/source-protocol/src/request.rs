//! Запрос от приложения к source-плагину по контракту.

use serde::Deserialize;

/// Запрос от приложения по контракту.
#[derive(Deserialize)]
pub struct Request {
    /// Действие плагина source lifecycle.
    pub action: String,
    /// Данные операции.
    #[serde(default)]
    pub payload: serde_json::Value,
}
