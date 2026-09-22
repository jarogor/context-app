//! Состояние базового плагина настроек.
//!
//! Объединяет зарегистрированные секции и сохранённые значения. Состояние
//! сериализуется целиком в служебное состояние плагина, поэтому реестр и
//! значения переживают перезапуск приложения.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::models::{FieldSchema, RegisteredSection};
use crate::registry::Registry;

/// Состояние настроек: реестр секций и сохранённые значения.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SettingsState {
    /// Зарегистрированные секции настроек.
    #[serde(default)]
    registry: Vec<RegisteredSection>,
    /// Сохранённые значения по полному идентификатору секции.
    #[serde(default)]
    values: BTreeMap<String, serde_json::Value>,
}

impl SettingsState {
    /// Создание пустого состояния.
    pub fn new() -> Self {
        Self::default()
    }

    /// Замена реестра без изменения сохранённых значений.
    pub fn set_registry(&mut self, registry: &Registry) {
        self.registry = registry.sections().to_vec();
    }

    /// Секции реестра.
    pub fn registry(&self) -> &[RegisteredSection] {
        &self.registry
    }

    /// Поиск секции по полному идентификатору.
    pub fn find(&self, id: &str) -> Option<&RegisteredSection> {
        self.registry.iter().find(|section| section.id == id)
    }

    /// Текущие значения секции: значения по умолчанию, перекрытые сохранёнными.
    ///
    /// Для неизвестной секции возвращается `None`.
    pub fn values_for(&self, id: &str) -> Option<serde_json::Value> {
        let section = self.find(id)?;
        let mut object = serde_json::Map::new();
        for field in &section.fields {
            object.insert(field.key.clone(), field_default(field));
        }
        if let Some(stored_object) = self.values.get(id).and_then(|value| value.as_object()) {
            for (key, value) in stored_object {
                object.insert(key.clone(), value.clone());
            }
        }
        Some(serde_json::Value::Object(object))
    }

    /// Список секций с текущими значениями для UI.
    pub fn sections_with_values(&self) -> Vec<serde_json::Value> {
        self.registry
            .iter()
            .map(|section| {
                serde_json::json!({
                    "id": section.id,
                    "owner": section.owner,
                    "kind": section.kind,
                    "title": section.title,
                    "description": section.description,
                    "fields": section.fields,
                    "values": self
                        .values_for(&section.id)
                        .unwrap_or_else(|| serde_json::json!({})),
                })
            })
            .collect()
    }

    /// Сохранение значений секции с объединением ключей верхнего уровня.
    ///
    /// Возвращает объединённые значения. Для неизвестной секции или
    /// не-объекта значений возвращается ошибка без изменения состояния.
    pub fn set_values(
        &mut self,
        id: &str,
        values: &serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        if self.find(id).is_none() {
            return Err(format!("неизвестная секция настроек: {id}"));
        }
        let incoming = values
            .as_object()
            .ok_or_else(|| "значения секции должны быть объектом".to_string())?;
        if incoming.is_empty() {
            return self
                .values_for(id)
                .ok_or_else(|| "неизвестная секция настроек".to_string());
        }
        let entry = self
            .values
            .entry(id.to_string())
            .or_insert_with(|| serde_json::json!({}));
        if !entry.is_object() {
            *entry = serde_json::json!({});
        }
        let target = entry
            .as_object_mut()
            .expect("значения секции приведены к объекту");
        for (key, value) in incoming {
            target.insert(key.clone(), value.clone());
        }
        self.values_for(id)
            .ok_or_else(|| "неизвестная секция настроек".to_string())
    }
}

/// Значение по умолчанию поля: явное или вычисленное по типу.
///
/// Для `select` по умолчанию берётся первый вариант; неизвестный тип даёт
/// `null`, соответствующее безопасному escape hatch `json`.
fn field_default(field: &FieldSchema) -> serde_json::Value {
    if let Some(value) = &field.default {
        return value.clone();
    }
    match field.field_type.as_str() {
        "boolean" => serde_json::json!(false),
        "number" => serde_json::json!(0),
        "string" => serde_json::json!(""),
        "select" => field
            .options
            .first()
            .map(|option| option.value.clone())
            .unwrap_or(serde_json::Value::Null),
        _ => serde_json::Value::Null,
    }
}

#[cfg(test)]
#[path = "store_tests.rs"]
mod tests;
