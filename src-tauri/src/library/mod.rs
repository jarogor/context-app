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
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex as StdMutex,
};

use notify::{RecursiveMode, Watcher};
use rusqlite::Connection;

use crate::calibre;
use crate::calibre::catalog::{
    build_catalog_at, build_catalog_from_books, build_catalog_from_index, open_cached_catalog,
};
use crate::calibre::index::{catalog_path, index_path, LibraryIndex};
use crate::constants::DATABASE_FILE_NAME;

use self::layout::Layout;

/// Открытая портируемая директория библиотеки.
pub struct Library {
    /// Корневой путь библиотеки.
    root: PathBuf,
    /// Имена служебных каталогов библиотеки.
    layout: Layout,
    /// Соединение с базой данных каталога.
    connection: Connection,
    /// Режим источника книг.
    mode: LibraryMode,
    /// Локальный индекс внешней Calibre-библиотеки.
    index: Option<LibraryIndex>,
    /// Признак наличия изменений файловой системы.
    dirty: Option<Arc<AtomicBool>>,
    /// Активный наблюдатель файловой системы Calibre.
    _watcher: Option<notify::RecommendedWatcher>,
    /// Накопленные пути изменённых файлов.
    changed_paths: Option<Arc<StdMutex<Vec<PathBuf>>>>,
    /// Признак выполняющейся фоновой индексации.
    indexing: bool,
    /// Текущий этап загрузки библиотеки.
    stage: String,
}

impl Library {
    /// Быстрое создание состояния Calibre перед фоновой индексацией.
    pub fn open_for_selection(root: impl Into<PathBuf>) -> Result<Self, LibraryError> {
        let root = root.into();
        if !root.exists() {
            return Err(LibraryError::NotADirectory(root));
        }
        if root.is_dir() {
            return Self::create_provisional_state(root);
        }
        Self::open(root)
    }

    /// Создание временного состояния до завершения фоновой индексации.
    fn create_provisional_state(root: PathBuf) -> Result<Self, LibraryError> {
        Ok(Self {
            root,
            layout: Layout::default(),
            connection: Connection::open_in_memory()?,
            mode: LibraryMode::Portable,
            index: None,
            dirty: None,
            _watcher: None,
            changed_paths: None,
            indexing: true,
            stage: "opening".to_string(),
        })
    }

    /// Открытие библиотеки по корневому пути.
    ///
    /// При первом открытии создаётся структура директории: папки `books/`,
    /// `covers/`, `plugins/` и файл `library.db`. Существующая библиотека
    /// валидируется и открывается без изменений.
    pub fn open(root: impl Into<PathBuf>) -> Result<Self, LibraryError> {
        let root = root.into();
        if calibre::looks_like_library(&root) && !root.join(DATABASE_FILE_NAME).exists() {
            let path = index_path(&root);
            let (connection, index) = match LibraryIndex::load(&path, &root)? {
                Some(index) => (build_catalog_from_index(&index)?, index),
                None => {
                    let scanned = crate::calibre::scanner::scan(&root)?;
                    let index = LibraryIndex::from_scanned(&root, scanned.clone());
                    index.save_atomic(&path)?;
                    (build_catalog_from_books(scanned)?, index)
                }
            };
            let mut library = Self::create_calibre_state(root, connection)?;
            library.index = Some(index);
            library.start_watcher()?;
            return Ok(library);
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
            index: None,
            dirty: None,
            _watcher: None,
            changed_paths: None,
            indexing: false,
            stage: "ready".to_string(),
        })
    }

    /// Создание состояния виртуальной Calibre-библиотеки.
    fn create_calibre_state(root: PathBuf, connection: Connection) -> Result<Self, LibraryError> {
        let dirty = Arc::new(AtomicBool::new(false));
        let callback_dirty = Arc::clone(&dirty);
        let changed_paths = Arc::new(StdMutex::new(Vec::new()));
        let callback_paths = Arc::clone(&changed_paths);
        let _ = (callback_dirty, callback_paths);
        Ok(Self {
            root,
            layout: Layout::default(),
            connection,
            mode: LibraryMode::CalibreVirtual,
            index: None,
            dirty: Some(dirty),
            _watcher: None,
            changed_paths: Some(changed_paths),
            indexing: false,
            stage: "ready".to_string(),
        })
    }

    /// Запуск наблюдения за файловой системой Calibre.
    fn start_watcher(&mut self) -> Result<(), LibraryError> {
        let started = std::time::Instant::now();
        let Some(dirty) = self.dirty.as_ref() else {
            return Ok(());
        };
        let Some(changed_paths) = self.changed_paths.as_ref() else {
            return Ok(());
        };
        let callback_dirty = Arc::clone(dirty);
        let callback_paths = Arc::clone(changed_paths);
        let mut watcher = notify::recommended_watcher(
            move |result: notify::Result<notify::Event>| match result {
                Ok(event) => {
                    if let Ok(mut paths) = callback_paths.lock() {
                        paths.extend(event.paths);
                    }
                    callback_dirty.store(true, Ordering::Release);
                }
                Err(_) => {
                    callback_dirty.store(true, Ordering::Release);
                }
            },
        )?;
        watcher.watch(&self.root, RecursiveMode::Recursive)?;
        std::thread::sleep(std::time::Duration::from_millis(25));
        if let Ok(mut paths) = changed_paths.lock() {
            paths.clear();
        }
        dirty.store(false, Ordering::Release);
        self._watcher = Some(watcher);
        eprintln!(
            "[library] watcher ready in {:?}: {}",
            started.elapsed(),
            self.root.display()
        );
        Ok(())
    }

    /// Публикация готового Calibre-каталога после фоновой индексации.
    pub(crate) fn promote_calibre(
        &mut self,
        connection: Connection,
        index: LibraryIndex,
    ) -> Result<(), LibraryError> {
        let dirty = Arc::new(AtomicBool::new(false));
        let changed_paths = Arc::new(StdMutex::new(Vec::new()));
        self.mode = LibraryMode::CalibreVirtual;
        self.dirty = Some(dirty);
        self.changed_paths = Some(changed_paths);
        self.connection = connection;
        self.index = Some(index);
        self.indexing = false;
        self.stage = "ready".to_string();
        self.start_watcher()
    }

    /// Публикация готовой портируемой библиотеки.
    pub(crate) fn install_portable(&mut self, connection: Connection) {
        self.mode = LibraryMode::Portable;
        self.connection = connection;
        self.index = None;
        self.dirty = None;
        self._watcher = None;
        self.changed_paths = None;
        self.indexing = false;
        self.stage = "ready".to_string();
    }

    /// Подготовка портируемой библиотеки и открытие её базы данных.
    pub(crate) fn prepare_portable(root: &Path) -> Result<Connection, LibraryError> {
        let layout = Layout::default();
        Self::ensure_structure(root, &layout)?;
        Ok(Connection::open(root.join(DATABASE_FILE_NAME))?)
    }

    /// Признак выполняющейся фоновой индексации.
    pub(crate) fn is_indexing(&self) -> bool {
        self.indexing
    }

    /// Текущий этап загрузки библиотеки.
    pub(crate) fn stage(&self) -> &str {
        &self.stage
    }

    /// Установка текущего этапа загрузки библиотеки.
    pub(crate) fn set_stage(&mut self, stage: &str) {
        self.stage = stage.to_string();
    }

    /// Подготовка выбранной директории к открытию.
    ///
    /// Если для директории есть совместимый кэш, используется он; иначе
    /// выполняется сканирование Calibre. Пустая директория открывается как
    /// портируемая библиотека.
    pub(crate) fn prepare_selected(
        root: &Path,
    ) -> Result<(bool, Connection, Option<LibraryIndex>), LibraryError> {
        let started = std::time::Instant::now();
        let index_file = index_path(root);
        let catalog_file = catalog_path(root);
        if let Some(index) = LibraryIndex::load(&index_file, root)? {
            if let Some(connection) = open_cached_catalog(&catalog_file)? {
                eprintln!(
                    "[library] cached catalog in {:?}: {}",
                    started.elapsed(),
                    root.display()
                );
                return Ok((true, connection, Some(index)));
            }
        }

        let scanned = crate::calibre::scanner::scan(root)?;
        eprintln!(
            "[library] scan in {:?}: {} books",
            started.elapsed(),
            scanned.len()
        );
        if scanned.is_empty() {
            return Ok((false, Self::prepare_portable(root)?, None));
        }

        let index = LibraryIndex::from_scanned(root, scanned.clone());
        index.save_atomic(&index_file)?;
        let connection = build_catalog_at(&catalog_file, scanned)?;
        eprintln!(
            "[library] index in {:?}: {}",
            started.elapsed(),
            root.display()
        );
        Ok((true, connection, Some(index)))
    }

    /// Фоновая загрузка индекса и публикация его в рабочем каталоге.
    pub fn build_calibre_index(&mut self) -> Result<(), LibraryError> {
        let path = index_path(&self.root);
        let (connection, index) = match LibraryIndex::load(&path, &self.root)? {
            Some(index) => (build_catalog_from_index(&index)?, index),
            None => {
                let scanned = crate::calibre::scanner::scan(&self.root)?;
                let index = LibraryIndex::from_scanned(&self.root, scanned.clone());
                index.save_atomic(&path)?;
                (build_catalog_from_books(scanned)?, index)
            }
        };
        self.connection = connection;
        self.index = Some(index);
        Ok(())
    }

    /// Обновление Calibre-каталога после событий файловой системы.
    pub fn sync_if_needed(&mut self) -> Result<(), LibraryError> {
        let Some(dirty) = self.dirty.as_ref() else {
            return Ok(());
        };
        if !dirty.swap(false, Ordering::AcqRel) {
            return Ok(());
        }
        let paths = self
            .changed_paths
            .as_ref()
            .and_then(|paths| {
                paths
                    .lock()
                    .ok()
                    .map(|mut paths| paths.drain(..).collect::<Vec<PathBuf>>())
            })
            .unwrap_or_default();
        let affected = affected_book_directories(&self.root, &paths);
        let scanned = if affected.is_empty() {
            crate::calibre::scanner::scan(&self.root)?
        } else {
            let mut books = self
                .index
                .as_ref()
                .map(|index| {
                    index
                        .books
                        .iter()
                        .filter(|book| !affected.contains(&self.root.join(&book.directory)))
                        .map(|book| book.scanned())
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            for directory in &affected {
                if let Some(author) = directory
                    .parent()
                    .and_then(|parent| parent.file_name())
                    .and_then(|name| name.to_str())
                {
                    let mut book = None;
                    for attempt in 0..3 {
                        match crate::calibre::scanner::scan_book_directory(
                            &self.root, author, directory,
                        ) {
                            Ok(value) => {
                                book = value;
                                break;
                            }
                            Err(error) if attempt < 2 => {
                                std::thread::sleep(std::time::Duration::from_millis(50));
                                if !directory.exists() {
                                    break;
                                }
                                let _ = error;
                            }
                            Err(error) => return Err(error.into()),
                        }
                    }
                    if let Some(book) = book {
                        books.push(book);
                    }
                }
            }
            books
        };
        let index = LibraryIndex::from_scanned(&self.root, scanned.clone());
        index.save_atomic(&index_path(&self.root))?;
        self.connection = build_catalog_from_books(scanned)?;
        self.index = Some(index);
        Ok(())
    }

    /// Признак наличия необработанных изменений файловой системы.
    pub fn is_dirty(&self) -> bool {
        self.dirty
            .as_ref()
            .is_some_and(|dirty| dirty.load(Ordering::Acquire))
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

/// Определение папок книг, затронутых изменениями файлов.
fn affected_book_directories(root: &Path, paths: &[PathBuf]) -> std::collections::HashSet<PathBuf> {
    paths
        .iter()
        .filter_map(|path| path.strip_prefix(root).ok())
        .filter_map(|relative| {
            let mut components = relative.components();
            let author = components.next()?;
            let book = components.next()?;
            Some(root.join(author).join(book))
        })
        .collect()
}

#[cfg(test)]
#[path = "_tests.rs"]
mod tests;
