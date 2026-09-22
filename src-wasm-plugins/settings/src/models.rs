//! Модели данных базового плагина настроек.
//!
//! Содержит только структуры без поведенческой логики. Формат декларации
//! секций задаёт сам плагин настроек; ядро передаёт его как opaque-схему.

use serde::{Deserialize, Serialize};

/// Схема декларации настроек одного владельца.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Schema {
    /// Заголовок владельца секций.
    #[serde(default)]
    pub title: Option<String>,
    /// Секции настроек владельца.
    #[serde(default)]
    pub sections: Vec<SectionSchema>,
}

/// Декларация одной секции настроек.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SectionSchema {
    /// Локальный идентификатор секции у владельца.
    pub id: String,
    /// Заголовок секции.
    pub title: String,
    /// Описание секции.
    #[serde(default)]
    pub description: Option<String>,
    /// Поля настроек секции.
    #[serde(default)]
    pub fields: Vec<FieldSchema>,
}

/// Декларация одного поля настроек.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FieldSchema {
    /// Ключ значения в секции.
    pub key: String,
    /// Человекочитаемое название поля.
    pub title: String,
    /// Тип поля: `boolean`, `string`, `number`, `select` или `json`.
    #[serde(rename = "type", default = "default_field_type")]
    pub field_type: String,
    /// Описание поля.
    #[serde(default)]
    pub description: Option<String>,
    /// Значение по умолчанию; при отсутствии вычисляется по типу.
    #[serde(default)]
    pub default: Option<serde_json::Value>,
    /// Варианты выбора для типа `select`.
    #[serde(default)]
    pub options: Vec<FieldOption>,
}

/// Вариант выбора для поля типа `select`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FieldOption {
    /// Значение варианта.
    pub value: serde_json::Value,
    /// Человекочитаемое название варианта.
    pub title: String,
}

/// Тип поля по умолчанию, если он не указан.
fn default_field_type() -> String {
    "json".to_string()
}

/// Декларация настроек владельца, пришедшая из ядра.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Source {
    /// Имя владельца секций (имя плагина или `app`).
    pub owner: String,
    /// Категория владельца.
    pub kind: String,
    /// Схема секций владельца.
    pub schema: Schema,
}

/// Зарегистрированная секция настроек.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RegisteredSection {
    /// Полный идентификатор секции в формате `<owner>.<section.id>`.
    pub id: String,
    /// Имя владельца секции.
    pub owner: String,
    /// Категория владельца.
    pub kind: String,
    /// Заголовок секции.
    pub title: String,
    /// Описание секции.
    #[serde(default)]
    pub description: Option<String>,
    /// Поля настроек секции.
    #[serde(default)]
    pub fields: Vec<FieldSchema>,
}
