//! Автор книги.

/// Автор, связанный с книгой.
#[derive(Debug, Clone, serde::Serialize)]
pub struct Author {
    pub id: i64,
    pub name: String,
}
