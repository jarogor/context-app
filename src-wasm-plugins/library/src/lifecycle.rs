//! Состояние и операции жизненного цикла базового source-плагина.
//!
//! Каталог хранится в локальном SQLite-индексе (см. `index`); ядро
//! предоставляет только opaque SQL host API. В памяти удерживается последний
//! согласованный snapshot для операций чтения, поиска и обложки.

use std::cell::RefCell;

use super::fs::Fs;
use super::index;
use super::models::{SourceCatalog, SOURCE_PROTOCOL_VERSION};

thread_local! {
    static CATALOG: RefCell<Option<SourceCatalog>> = const { RefCell::new(None) };
}

/// Открытие или актуализация каталога source-библиотеки.
pub(crate) fn open(fs: &impl Fs) -> Result<SourceCatalog, String> {
    publish(index::sync(fs)?)
}

/// Синхронизация состояния с текущим содержимым библиотеки.
pub(crate) fn sync(fs: &impl Fs) -> Result<SourceCatalog, String> {
    publish(index::sync(fs)?)
}

/// Восстановление последнего состояния без сканирования (портируемый режим).
pub(crate) fn restore(fs: &impl Fs) -> Result<SourceCatalog, String> {
    publish(index::load_catalog(fs)?)
}

/// Полная замена каталога плагина (портируемый режим).
pub(crate) fn replace(fs: &impl Fs, catalog: SourceCatalog) -> Result<SourceCatalog, String> {
    let revision = index::write_catalog(fs, &catalog.books)?;
    publish(SourceCatalog {
        protocol_version: SOURCE_PROTOCOL_VERSION,
        revision,
        books: catalog.books,
    })
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
