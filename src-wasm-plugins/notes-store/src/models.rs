//! Модели данных базового плагина заметок.
//!
//! Содержит только структуры без поведенческой логики. Формат набора заметок
//! задаёт сам плагин заметок; ядро передаёт его как opaque-модель.

use serde::{Deserialize, Serialize};

/// Цвет подсветки заметки по умолчанию.
pub const DEFAULT_NOTE_COLOR: &str = "yellow";

/// Доступные цвета подсветки заметки.
pub const NOTE_COLORS: [&str; 6] = ["yellow", "green", "blue", "red", "purple", "black"];

/// Приведение цвета к палитре; неизвестное или пустое значение даёт цвет по умолчанию.
pub fn normalize_color(value: &str) -> String {
    let value = value.trim();
    if NOTE_COLORS.contains(&value) {
        value.to_string()
    } else {
        DEFAULT_NOTE_COLOR.to_string()
    }
}

/// Цвет по умолчанию для полей, отсутствующих в сохранённых данных.
fn default_color() -> String {
    DEFAULT_NOTE_COLOR.to_string()
}

/// Тип заметки по умолчанию: цитата.
pub const DEFAULT_NOTE_TYPE: &str = "quote";

/// Известные типы заметок.
pub const NOTE_TYPES: [&str; 3] = ["quote", "text", "shape"];

/// Приведение типа к известному набору; неизвестное или пустое значение даёт тип по умолчанию.
pub fn normalize_type(value: &str) -> String {
    let value = value.trim();
    if NOTE_TYPES.contains(&value) {
        value.to_string()
    } else {
        DEFAULT_NOTE_TYPE.to_string()
    }
}

/// Тип по умолчанию для полей, отсутствующих в сохранённых данных.
fn default_type() -> String {
    DEFAULT_NOTE_TYPE.to_string()
}

/// Вид фигуры по умолчанию: линия.
pub const DEFAULT_SHAPE: &str = "line";

/// Известные виды фигур.
pub const SHAPE_KINDS: [&str; 3] = ["line", "rectangle", "ellipse"];

/// Приведение вида фигуры к известному набору; неизвестное или пустое значение даёт вид по умолчанию.
pub fn normalize_shape(value: &str) -> String {
    let value = value.trim();
    if SHAPE_KINDS.contains(&value) {
        value.to_string()
    } else {
        DEFAULT_SHAPE.to_string()
    }
}

/// Вид фигуры по умолчанию для полей, отсутствующих в сохранённых данных.
fn default_shape() -> String {
    DEFAULT_SHAPE.to_string()
}

/// Заметка к месту в книге.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Note {
    /// Идентификатор заметки.
    pub id: String,
    /// Тип заметки: цитата, текстовая карточка или фигура.
    #[serde(rename = "type", default = "default_type")]
    pub note_type: String,
    /// Непрозрачный якорь места в книге, задаваемый плагином формата.
    #[serde(default)]
    pub anchor: String,
    /// Цитата места в книге.
    #[serde(default)]
    pub quote: String,
    /// Метка главы или раздела места в книге.
    #[serde(default)]
    pub chapter: String,
    /// Цвет подсветки заметки.
    #[serde(default = "default_color")]
    pub color: String,
    /// Доля позиции в книге; может отсутствовать.
    #[serde(default)]
    pub percent: Option<f64>,
    /// Номер страницы для страничных форматов; может отсутствовать.
    #[serde(default)]
    pub page: Option<u32>,
    /// Текст заметки.
    #[serde(default)]
    pub text: String,
    /// Вид фигуры для заметки типа `shape`.
    #[serde(default = "default_shape")]
    pub shape: String,
    /// Непрозрачная геометрия фигуры, задаваемая плагином формата.
    #[serde(default)]
    pub geometry: String,
    /// Время создания (Unix, мс).
    #[serde(default)]
    pub created_at_millis: i64,
    /// Время последнего изменения (Unix, мс).
    #[serde(default)]
    pub updated_at_millis: i64,
}

/// Набор заметок к одной книге.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NoteSet {
    /// Идентификатор набора.
    pub id: String,
    /// Непрозрачный ключ книги, которой принадлежит набор.
    #[serde(default)]
    pub book_key: String,
    /// Человекочитаемое имя набора.
    #[serde(default)]
    pub name: String,
    /// Время создания (Unix, мс).
    #[serde(default)]
    pub created_at_millis: i64,
    /// Заметки набора в порядке добавления.
    #[serde(default)]
    pub notes: Vec<Note>,
}

/// Входные данные для добавления заметки.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct NoteInput {
    /// Тип заметки; отсутствие даёт тип по умолчанию (цитата).
    #[serde(rename = "type", default)]
    pub note_type: Option<String>,
    /// Непрозрачный якорь места в книге.
    #[serde(default)]
    pub anchor: String,
    /// Цитата места в книге.
    #[serde(default)]
    pub quote: String,
    /// Метка главы или раздела места в книге.
    #[serde(default)]
    pub chapter: String,
    /// Цвет подсветки заметки; отсутствие даёт цвет по умолчанию.
    #[serde(default)]
    pub color: Option<String>,
    /// Доля позиции в книге; может отсутствовать.
    #[serde(default)]
    pub percent: Option<f64>,
    /// Номер страницы для страничных форматов; может отсутствовать.
    #[serde(default)]
    pub page: Option<u32>,
    /// Текст заметки.
    #[serde(default)]
    pub text: String,
    /// Вид фигуры; отсутствие даёт вид по умолчанию.
    #[serde(default)]
    pub shape: Option<String>,
    /// Непрозрачная геометрия фигуры.
    #[serde(default)]
    pub geometry: String,
}

/// Частичное изменение заметки: заданные поля перекрывают текущие.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct NotePatch {
    /// Новый тип заметки; при отсутствии тип не меняется.
    #[serde(rename = "type", default)]
    pub note_type: Option<String>,
    /// Новый текст заметки; при отсутствии текст не меняется.
    #[serde(default)]
    pub text: Option<String>,
    /// Новая цитата места; при отсутствии не меняется.
    #[serde(default)]
    pub quote: Option<String>,
    /// Новый непрозрачный якорь места; при отсутствии не меняется.
    #[serde(default)]
    pub anchor: Option<String>,
    /// Новая метка главы или раздела; при отсутствии не меняется.
    #[serde(default)]
    pub chapter: Option<String>,
    /// Новый цвет подсветки; при отсутствии не меняется.
    #[serde(default)]
    pub color: Option<String>,
    /// Новая доля позиции; при отсутствии не меняется.
    #[serde(default)]
    pub percent: Option<f64>,
    /// Новый номер страницы; при отсутствии не меняется.
    #[serde(default)]
    pub page: Option<u32>,
    /// Новый вид фигуры; при отсутствии не меняется.
    #[serde(default)]
    pub shape: Option<String>,
    /// Новая непрозрачная геометрия; при отсутствии не меняется.
    #[serde(default)]
    pub geometry: Option<String>,
}

#[cfg(test)]
#[path = "models_tests.rs"]
mod tests;
