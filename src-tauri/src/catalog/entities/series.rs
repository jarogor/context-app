//! Серия книг.

/// Серия, к которой может относиться книга.
#[derive(Debug, Clone, serde::Serialize)]
pub struct Series {
    pub id: i64,
    pub name: String,
}
