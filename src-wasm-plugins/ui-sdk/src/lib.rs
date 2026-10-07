//! SDK декларативного интерфейса плагинов приложения «Текстура».
//!
//! Плагин не поставляет фронтенд: он описывает интерфейс деревом узлов
//! `ui-schema`, а хост рисует его компонентами единой дизайн-системы. SDK даёт
//! типизированные конструкторы узлов, пространств и действий, чтобы плагин не
//! собирал JSON вручную и оставался на контракте схемы.

use serde::Serialize;
use serde_json::{json, Map, Value};

/// Версия схемы декларативного интерфейса, поддерживаемая SDK.
pub const UI_SCHEMA_VERSION: u32 = 1;

/// Идентификатор пространства «секция настроек».
pub const SPACE_SETTINGS_SECTION: &str = "settings.section";

/// Создание текстового узла дерева интерфейса.
#[cfg(test)]
pub(crate) fn text(value: &str) -> Value {
    json!({ "type": "#text", "value": value })
}

/// Конструктор элемента дерева интерфейса.
///
/// Позволяет последовательно задать свойства, действия и дочерние узлы, а затем
/// собрать значение `ui-schema`. Пустые наборы свойств, действий и детей в узел
/// не попадают.
#[derive(Debug, Clone, Default)]
pub struct Element {
    /// Имя компонента дизайн-системы.
    kind: String,
    /// Свойства компонента.
    props: Map<String, Value>,
    /// Действия по событиям: имя события -> идентификатор действия.
    on: Map<String, Value>,
    /// Дочерние узлы.
    children: Vec<Value>,
}

impl Element {
    /// Создание элемента указанного компонента.
    pub fn new(kind: &str) -> Self {
        Self {
            kind: kind.to_string(),
            ..Self::default()
        }
    }

    /// Добавление свойства компонента.
    pub fn prop(mut self, key: &str, value: impl Into<Value>) -> Self {
        self.props.insert(key.to_string(), value.into());
        self
    }

    /// Связывание события узла с идентификатором действия (интентом).
    pub fn action(mut self, event: &str, action: &str) -> Self {
        self.on
            .insert(event.to_string(), Value::String(action.to_string()));
        self
    }

    /// Добавление набора дочерних узлов.
    pub fn children(mut self, nodes: impl IntoIterator<Item = Value>) -> Self {
        self.children.extend(nodes);
        self
    }

    /// Сборка узла в значение `ui-schema`.
    pub fn build(self) -> Value {
        let mut node = Map::new();
        node.insert("type".to_string(), Value::String(self.kind));
        if !self.props.is_empty() {
            node.insert("props".to_string(), Value::Object(self.props));
        }
        if !self.on.is_empty() {
            node.insert("on".to_string(), Value::Object(self.on));
        }
        if !self.children.is_empty() {
            node.insert("children".to_string(), Value::Array(self.children));
        }
        Value::Object(node)
    }
}

/// Декларация плагином одного экземпляра пространства интерфейса.
#[derive(Debug, Clone, Serialize)]
pub struct Declaration {
    /// Стабильный идентификатор пространства.
    pub space: String,
    /// Идентификатор экземпляра пространства.
    pub id: String,
    /// Заголовок экземпляра.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// Описание экземпляра.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Тело экземпляра деревом узлов.
    pub nodes: Vec<Value>,
}

impl Declaration {
    /// Создание декларации для пространства и экземпляра.
    pub fn new(space: &str, id: &str) -> Self {
        Self {
            space: space.to_string(),
            id: id.to_string(),
            title: None,
            description: None,
            nodes: Vec::new(),
        }
    }

    /// Задание заголовка экземпляра.
    pub fn title(mut self, title: &str) -> Self {
        self.title = Some(title.to_string());
        self
    }

    /// Задание описания экземпляра.
    pub fn description(mut self, description: &str) -> Self {
        self.description = Some(description.to_string());
        self
    }

    /// Добавление узла в тело экземпляра.
    pub fn node(mut self, node: Value) -> Self {
        self.nodes.push(node);
        self
    }

    /// Сборка ответа хосту со списком деклараций и версией схемы.
    pub fn response(declarations: &[Declaration]) -> Value {
        json!({
            "version": UI_SCHEMA_VERSION,
            "spaces": declarations,
        })
    }
}

#[cfg(test)]
#[path = "lib_tests.rs"]
mod tests;
