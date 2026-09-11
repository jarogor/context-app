//! Тег книги.

/// Тег, которым помечена книга.
#[derive(Debug, Clone, serde::Serialize)]
pub struct Tag {
  pub id: i64,
  pub name: String,
}