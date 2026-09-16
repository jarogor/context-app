//! Автор книги.

/// Автор, связанный с книгой.
#[derive(Debug, Clone, serde::Serialize)]
pub struct Author {
    /// Идентификатор автора в базе данных.
    pub id: i64,
    /// Имя автора.
    pub name: String,
}
