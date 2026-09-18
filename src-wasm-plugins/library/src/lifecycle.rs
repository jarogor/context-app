//! Состояние и операции жизненного цикла базового source-плагина.

use std::cell::RefCell;

use super::fs::Fs;
use super::models::{ExternalBook, SourceCatalog, SourceState, SOURCE_PROTOCOL_VERSION};

const STATE_KEY: &str = "library-state.json";
const STATE_VERSION: u32 = 1;

thread_local! {
    static CATALOG: RefCell<Option<SourceCatalog>> = const { RefCell::new(None) };
}

/// Создание snapshot каталога с новой ревизией.
pub(crate) fn open(fs: &impl Fs, books: Vec<ExternalBook>) -> Result<SourceCatalog, String> {
    let current = build(books)?;
    if let Some(state) = load(fs)? {
        if state.fingerprint == fingerprint(&current) {
            CATALOG.with(|stored| {
                *stored.borrow_mut() = Some(state.catalog.clone());
            });
            return Ok(state.catalog);
        }
    }
    save(fs, &current)
}

/// Синхронизация состояния по текущему набору книг.
pub(crate) fn sync(fs: &impl Fs, books: Vec<ExternalBook>) -> Result<SourceCatalog, String> {
    save(fs, &build(books)?)
}

/// Получение последнего согласованного snapshot.
pub(crate) fn catalog() -> Option<SourceCatalog> {
    CATALOG.with(|state| state.borrow().clone())
}

fn build(books: Vec<ExternalBook>) -> Result<SourceCatalog, String> {
    let revision = CATALOG.with(|state| {
        state
            .borrow()
            .as_ref()
            .map_or(1, |catalog| catalog.revision.saturating_add(1))
    });
    Ok(SourceCatalog {
        protocol_version: SOURCE_PROTOCOL_VERSION,
        revision,
        books,
    })
}

fn load(fs: &impl Fs) -> Result<Option<SourceState>, String> {
    let Some(value) = fs.state_read(STATE_KEY)? else {
        return Ok(None);
    };
    let Ok(state) = serde_json::from_str::<SourceState>(&value) else {
        fs.state_delete(STATE_KEY)?;
        return Ok(None);
    };
    if state.version != STATE_VERSION || state.catalog.protocol_version != SOURCE_PROTOCOL_VERSION {
        fs.state_delete(STATE_KEY)?;
        return Ok(None);
    }
    Ok(Some(state))
}

fn save(fs: &impl Fs, catalog: &SourceCatalog) -> Result<SourceCatalog, String> {
    let state = SourceState {
        version: STATE_VERSION,
        fingerprint: fingerprint(catalog),
        catalog: catalog.clone(),
    };
    let value = serde_json::to_string(&state).map_err(|error| error.to_string())?;
    fs.state_write(STATE_KEY, &value)?;
    CATALOG.with(|state| {
        *state.borrow_mut() = Some(catalog.clone());
    });
    Ok(catalog.clone())
}

fn fingerprint(catalog: &SourceCatalog) -> String {
    serde_json::to_string(&catalog.books).unwrap_or_default()
}
