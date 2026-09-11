//! Портируемый слой библиотеки.
//!
//! Модуль отвечает за открытие и валидацию портируемой директории библиотеки,
//! создание служебных папок и файла SQLite-базы при первом открытии.

pub mod error;

pub use error::LibraryError;

use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::Connection;

/// Имя файла SQLite-базы внутри портируемой директории.
pub const DATABASE_FILE_NAME: &str = "library.db";
/// Имя папки с файлами книг.
pub const BOOKS_DIR_NAME: &str = "books";
/// Имя папки с обложками.
pub const COVERS_DIR_NAME: &str = "covers";
/// Имя папки с плагинами.
pub const PLUGINS_DIR_NAME: &str = "plugins";

/// Структура наименований каталогов внутри библиотеки.
#[derive(Clone)]
struct Layout {
  pub books: &'static str,
  pub covers: &'static str,
  pub plugins: &'static str,
}

impl Layout {
  const fn default() -> Self {
    Self {
      books: BOOKS_DIR_NAME,
      covers: COVERS_DIR_NAME,
      plugins: PLUGINS_DIR_NAME,
    }
  }
}

/// Открытая портируемая директория библиотеки.
pub struct Library {
  root: PathBuf,
  layout: Layout,
  connection: Connection,
}

impl Library {
    /// Открытие библиотеки по корневому пути.
    ///
    /// При первом открытии создаётся структура директории: папки `books/`,
    /// `covers/`, `plugins/` и файл `library.db`. Существующая библиотека
    /// валидируется и открывается без изменений.
    pub fn open(root: impl Into<PathBuf>) -> Result<Self, LibraryError> {
      let root = root.into();
      let layout = Layout::default();
      Self::ensure_structure(&root, &layout)?;
      let database_path = root.join(DATABASE_FILE_NAME);
      let connection = Connection::open(&database_path)?;
      Ok(Self {
        root,
        layout,
        connection,
      })
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
mod tests {
    use super::*;
    use crate::test_util;

    /// Получение временной директории для теста.
    fn temp_library_root(name: &str) -> PathBuf {
        test_util::test_root(name)
    }

    fn remove_dir_contents(path: &Path) {
      test_util::cleanup(path);
    }

    #[test]
    fn open_creates_portable_structure() {
      let root = temp_library_root("open-creates-structure");
      remove_dir_contents(&root);
      fs::create_dir_all(&root).expect("создание корня теста");

      let library = Library::open(&root).expect("открытие библиотеки");

      assert!(root.join(DATABASE_FILE_NAME).exists(), "файл БД создан");
      assert!(root.join(BOOKS_DIR_NAME).is_dir(), "папка books создана");
      assert!(root.join(COVERS_DIR_NAME).is_dir(), "папка covers создана");
      assert!(root.join(PLUGINS_DIR_NAME).is_dir(), "папка plugins создана");
      assert_eq!(library.books_dir(), BOOKS_DIR_NAME);
      assert_eq!(library.covers_dir(), COVERS_DIR_NAME);
      assert_eq!(library.plugins_dir(), PLUGINS_DIR_NAME);

      remove_dir_contents(&root);
    }

    #[test]
    fn open_existing_library_keeps_structure() {
      let root = temp_library_root("open-existing");
      remove_dir_contents(&root);
      fs::create_dir_all(&root).expect("создание корня теста");
      fs::create_dir_all(root.join("books")).expect("создание books");
      fs::create_dir_all(root.join("covers")).expect("создание covers");
      fs::create_dir_all(root.join("plugins")).expect("создание plugins");
      Connection::open(root.join(DATABASE_FILE_NAME)).expect("создание БД");

      let library = Library::open(&root).expect("открытие существующей библиотеки");
      assert!(root.join(DATABASE_FILE_NAME).exists(), "БД осталась на месте");
      assert_eq!(library.root(), &root);

      remove_dir_contents(&root);
    }

    #[test]
    fn open_path_is_a_file_reports_error() {
      let root = temp_library_root("open-file-not-dir");
      remove_dir_contents(&root);
      fs::create_dir_all(&root).expect("создание корня теста");
      let not_a_dir = root.join("plain-file.txt");
      fs::write(&not_a_dir, "not a dir").expect("запись файла");

      let result = Library::open(&not_a_dir);
      assert!(result.is_err(), "путь к файлу не является библиотекой");

      remove_dir_contents(&root);
    }
}