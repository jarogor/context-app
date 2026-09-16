//! Режим источника библиотеки.

/// Формат открытого источника книг.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LibraryMode {
    /// Собственная портируемая библиотека с файловой SQLite-базой.
    Portable,
    /// Внешняя Calibre-библиотека с виртуальным каталогом в памяти.
    CalibreVirtual,
}

impl LibraryMode {
    /// Строковое представление режима для frontend API.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Portable => "portable",
            Self::CalibreVirtual => "calibre",
        }
    }
}
