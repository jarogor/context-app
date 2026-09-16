//! Связь книги с серией.

use super::series::Series;

/// Принадлежность книги серии с порядковым номером внутри серии.
#[derive(Debug, Clone, serde::Serialize)]
pub struct SeriesLink {
    /// Серия, к которой относится книга.
    pub series: Series,
    /// Порядковый номер книги внутри серии.
    pub series_index: i64,
}
