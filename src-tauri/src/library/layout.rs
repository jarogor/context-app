//! Структура наименований каталогов внутри библиотеки.

use crate::constants::{BOOKS_DIR_NAME, COVERS_DIR_NAME, PLUGINS_DIR_NAME};

/// Структура наименований каталогов внутри библиотеки.
#[derive(Clone)]
pub(super) struct Layout {
    /// Имя папки с файлами книг.
    pub books: &'static str,
    /// Имя папки с обложками.
    pub covers: &'static str,
    /// Имя папки с плагинами.
    pub plugins: &'static str,
}

impl Layout {
    /// Набор имён каталогов по умолчанию.
    pub const fn default() -> Self {
        Self {
            books: BOOKS_DIR_NAME,
            covers: COVERS_DIR_NAME,
            plugins: PLUGINS_DIR_NAME,
        }
    }
}
