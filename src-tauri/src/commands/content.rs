//! Модель ответа команд чтения книги.

/// Содержимое книги для read-view.
#[derive(serde::Serialize)]
pub struct BookContent {
    pub title: String,
    pub authors: Vec<String>,
    pub text: String,
}
