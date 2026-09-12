//! Структура наименований каталогов внутри библиотеки.

use crate::constants::{BOOKS_DIR_NAME, COVERS_DIR_NAME, PLUGINS_DIR_NAME};

/// Структура наименований каталогов внутри библиотеки.
#[derive(Clone)]
pub(super) struct Layout {
    pub books: &'static str,
    pub covers: &'static str,
    pub plugins: &'static str,
}

impl Layout {
    pub const fn default() -> Self {
        Self {
            books: BOOKS_DIR_NAME,
            covers: COVERS_DIR_NAME,
            plugins: PLUGINS_DIR_NAME,
        }
    }
}
