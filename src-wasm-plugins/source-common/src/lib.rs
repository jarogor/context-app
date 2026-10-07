//! Общие модели и хелперы source-плагинов библиотек приложения «Текстура».
//!
//! Крейт выделяет то, что дословно совпадало у `library` и `library-calibre`:
//! модели нейтрального каталога, трейт [`fs::Fs`], разбор EPUB и XML,
//! каркас версионированного SQL-индекса и нативный тестовый SQL-движок.
//! Конкретика источника (сканирование, раскладка, органы управления) остаётся
//! в самих плагинах.

pub mod epub;
pub mod fs;
pub mod index;
pub mod labels;
pub mod models;
pub mod request;
pub mod xml;

#[cfg(target_arch = "wasm32")]
pub mod host;

#[cfg(feature = "test-sql")]
pub mod test_sql;
