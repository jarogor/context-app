//! Связь книги с серией.

use super::series::Series;

/// Принадлежность книги серии с порядковым номером внутри серии.
pub struct SeriesLink {
  pub series: Series,
  pub series_index: i64,
}