//! Тег книги.

/// Тег, которым помечена книга.
#[derive(Debug, Clone, serde::Serialize)]
pub struct Tag {
    /// Идентификатор тега в базе данных.
    pub id: i64,
    /// Название тега.
    pub name: String,
}
