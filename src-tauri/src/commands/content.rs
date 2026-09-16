//! Модель ответа команд чтения книги.

/// Содержимое книги для read-view.
#[derive(serde::Serialize)]
pub struct BookContent {
    /// Название книги.
    pub title: String,
    /// Авторы книги.
    pub authors: Vec<String>,
    /// Полный текст книги.
    pub text: String,
}
