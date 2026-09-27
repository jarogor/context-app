//! Состояние и операции жизненного цикла source-плагина Calibre.
//!
//! Каталог хранится в локальном SQLite-индексе (см. `index`); ядро
//! предоставляет только opaque SQL host API. В памяти удерживается последний
//! согласованный snapshot для операций поиска, чтения и обложки.

use std::cell::RefCell;

use super::fs::Fs;
use super::index;
use super::models::SourceCatalog;

thread_local! {
    static CATALOG: RefCell<Option<SourceCatalog>> = const { RefCell::new(None) };
}

/// Открытие или актуализация каталога библиотеки Calibre.
pub(crate) fn open(fs: &impl Fs) -> Result<SourceCatalog, String> {
    publish(index::sync(fs)?)
}

/// Синхронизация состояния с текущим содержимым библиотеки.
pub(crate) fn sync(fs: &impl Fs) -> Result<SourceCatalog, String> {
    publish(index::sync(fs)?)
}

/// Получение последнего согласованного snapshot.
pub(crate) fn catalog() -> Option<SourceCatalog> {
    CATALOG.with(|state| state.borrow().clone())
}

/// Сохранение snapshot в памяти как последнего согласованного.
fn publish(catalog: SourceCatalog) -> Result<SourceCatalog, String> {
    CATALOG.with(|stored| {
        *stored.borrow_mut() = Some(catalog.clone());
    });
    Ok(catalog)
}
