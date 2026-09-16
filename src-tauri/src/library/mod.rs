//! Портируемый слой библиотеки.
//!
//! Модуль отвечает за открытие и валидацию портируемой директории библиотеки,
//! создание служебных папок и файла SQLite-базы при первом открытии.

pub mod error;
mod layout;
mod mode;

pub use error::LibraryError;
pub use mode::LibraryMode;

use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::Connection;

use crate::calibre;
use crate::calibre::catalog::build_virtual_catalog;
use crate::constants::DATABASE_FILE_NAME;

use self::layout::Layout;

/// Открытая портируемая директория библиотеки.
pub struct Library {
    root: PathBuf,
    layout: Layout,
    connection: Connection,
    mode: LibraryMode,
}

impl Library {
    /// Открытие библиотеки по корневому пути.
    ///
    /// При первом открытии создаётся структура директории: папки `books/`,
    /// `covers/`, `plugins/` и файл `library.db`. Существующая библиотека
    /// валидируется и открывается без изменений.
    pub fn open(root: impl Into<PathBuf>) -> Result<Self, LibraryError> {
        let root = root.into();
        if calibre::looks_like_library(&root) && !root.join(DATABASE_FILE_NAME).exists() {
            let connection = build_virtual_catalog(&root)?;
            return Ok(Self {
                root,
                layout: Layout::default(),
                connection,
                mode: LibraryMode::CalibreVirtual,
            });
        }

        let layout = Layout::default();
        Self::ensure_structure(&root, &layout)?;
        let database_path = root.join(DATABASE_FILE_NAME);
        let connection = Connection::open(&database_path)?;
        Ok(Self {
            root,
            layout,
            connection,
            mode: LibraryMode::Portable,
        })
    }

    /// Формат открытого источника книг.
    pub fn mode(&self) -> LibraryMode {
        self.mode
    }

    /// Корневой путь библиотеки.
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Относительный путь до папки книг.
    pub fn books_dir(&self) -> &'static str {
        self.layout.books
    }

    /// Относительный путь до папки обложек.
    pub fn covers_dir(&self) -> &'static str {
        self.layout.covers
    }

    /// Относительный путь до папки плагинов.
    pub fn plugins_dir(&self) -> &'static str {
        self.layout.plugins
    }

    /// Абсолютный путь до папки книг.
    pub fn books_dir_abs(&self) -> PathBuf {
        self.root.join(self.layout.books)
    }

    /// Абсолютный путь до папки обложек.
    pub fn covers_dir_abs(&self) -> PathBuf {
        self.root.join(self.layout.covers)
    }

    /// Абсолютный путь до папки плагинов.
    pub fn plugins_dir_abs(&self) -> PathBuf {
        self.root.join(self.layout.plugins)
    }

    /// Ссылка на соединение с базой данных.
    pub fn connection(&self) -> &Connection {
        &self.connection
    }

    /// Многоразовое соединение с базой данных.
    pub fn connection_mut(&mut self) -> &mut Connection {
        &mut self.connection
    }

    /// Создание структуры портируемой директории при её отсутствии.
    fn ensure_structure(root: &Path, layout: &Layout) -> Result<(), LibraryError> {
        if !root.exists() {
            fs::create_dir_all(root)?;
        }
        if !root.is_dir() {
            return Err(LibraryError::NotADirectory(root.to_path_buf()));
        }

        fs::create_dir_all(root.join(layout.books))?;
        fs::create_dir_all(root.join(layout.covers))?;
        fs::create_dir_all(root.join(layout.plugins))?;

        let database_path = root.join(DATABASE_FILE_NAME);
        if !database_path.exists() {
            Connection::open(&database_path)?;
        }

        Ok(())
    }
}

#[cfg(test)]
#[path = "_tests.rs"]
mod tests;
