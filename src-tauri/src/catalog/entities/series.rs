//! Серия книг.

/// Серия, к которой может относиться книга.
#[derive(Debug, Clone, serde::Serialize)]
pub struct Series {
    /// Идентификатор серии в базе данных.
    pub id: i64,
    /// Название серии.
    pub name: String,
}
