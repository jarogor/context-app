//! Портируемый слой библиотеки.
//!
//! Модуль отвечает за открытие и валидацию портируемой директории библиотеки,
//! создание служебных папок и файла SQLite-базы при первом открытии, а также
//! за внешние библиотеки, читаемые source-плагинами через виртуальный каталог.

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

use crate::constants::{bundled_plugins_dir, DATABASE_FILE_NAME};
use crate::journal::{get_journal_handle, Severity};
use crate::plugin::PluginRuntime;
use crate::sources::catalog::{
    build_catalog_at, build_catalog_from_books, build_catalog_from_index, open_cached_catalog,
};
use crate::sources::index::{catalog_path, index_path, LibraryIndex};
use crate::sources::{self};

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
    /// Имя плагина-источника для внешней библиотеки.
    source_name: Option<String>,
    /// Локальный индекс внешней библиотеки.
    index: Option<LibraryIndex>,
    /// Признак наличия изменений файловой системы.
    dirty: Option<Arc<AtomicBool>>,
    /// Активный наблюдатель файловой системы внешней библиотеки.
    _watcher: Option<notify::RecommendedWatcher>,
    /// Накопленные пути изменённых файлов.
    changed_paths: Option<Arc<StdMutex<Vec<PathBuf>>>>,
    /// Признак выполняющейся фоновой индексации.
    indexing: bool,
    /// Текущий этап загрузки библиотеки.
    stage: String,
    /// Плагинная подсистема библиотеки.
    runtime: PluginRuntime,
}

impl Library {
    /// Быстрое создание состояния перед фоновой индексацией.
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
        let layout = Layout::default();
        Ok(Self {
            root,
            layout,
            connection: Connection::open_in_memory()?,
            mode: LibraryMode::Portable,
            source_name: None,
            index: None,
            dirty: None,
            _watcher: None,
            changed_paths: None,
            indexing: true,
            stage: "opening".to_string(),
            runtime: PluginRuntime::empty(),
        })
    }

    /// Открытие библиотеки по корневому пути.
    ///
    /// Внешняя библиотека распознаётся опросом source-плагинов: первый
    /// плагин, подтвердивший поддержку корня, становится источником книг,
    /// а каталог строится поверх индексного кэша. Портируемая библиотека
    /// создаёт структуру директории и базу данных при первом открытии.
    pub fn open(root: impl Into<PathBuf>) -> Result<Self, LibraryError> {
        let root = root.into();
        let layout = Layout::default();
        let mut runtime = Self::load_runtime(&root, &layout)?;
        if let Some(source) = sources::coordinator::probe(&mut runtime, &root)? {
            let path = index_path(&root);
            let (connection, index) = match LibraryIndex::load(&path, &root)? {
                Some(index) => (build_catalog_from_index(&index)?, index),
                None => {
                    let scanned = sources::coordinator::scan(&mut runtime, &root, &source)?;
                    let index = LibraryIndex::from_external(&root, source.clone(), scanned.clone());
                    index.save_atomic(&path)?;
                    (build_catalog_from_books(scanned)?, index)
                }
            };
            let mut library = Self::create_external_state(root, connection, runtime)?;
            library.index = Some(index);
            library.source_name = Some(source);
            library.start_watcher()?;
            return Ok(library);
        }

        Self::ensure_structure(&root, &layout)?;
        seed_bundled_plugins(&root, &layout)?;
        // Перезагрузка плагинов, чтобы поставляемые плагины стали
        // доступны и из собственной папки `plugins/` библиотеки.
        runtime = Self::load_runtime(&root, &layout)?;
        let database_path = root.join(DATABASE_FILE_NAME);
        let connection = Connection::open(&database_path)?;
        Ok(Self {
            root,
            layout,
            connection,
            mode: LibraryMode::Portable,
            source_name: None,
            index: None,
            dirty: None,
            _watcher: None,
            changed_paths: None,
            indexing: false,
            stage: "ready".to_string(),
            runtime,
        })
    }

    /// Создание состояния внешней библиотеки с виртуальным каталогом.
    fn create_external_state(
        root: PathBuf,
        connection: Connection,
        runtime: PluginRuntime,
    ) -> Result<Self, LibraryError> {
        let dirty = Arc::new(AtomicBool::new(false));
        let changed_paths = Arc::new(StdMutex::new(Vec::new()));
        Ok(Self {
            root,
            layout: Layout::default(),
            connection,
            mode: LibraryMode::External,
            source_name: None,
            index: None,
            dirty: Some(dirty),
            _watcher: None,
            changed_paths: Some(changed_paths),
            indexing: false,
            stage: "ready".to_string(),
            runtime,
        })
    }

    /// Загрузка плагинов библиотеки из её `plugins/` и поставляемых ресурсов.
    ///
    /// Песочный корень плагинов устанавливается в корень библиотеки, чтобы
    /// source-плагины читали только её файлы.
    fn load_runtime(root: &Path, layout: &Layout) -> Result<PluginRuntime, LibraryError> {
        let directories = vec![root.join(layout.plugins), bundled_plugins_dir()];
        Ok(PluginRuntime::load(&directories, root)?)
    }

    /// Запуск наблюдения за файловой системой внешней библиотеки.
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
        let handle = get_journal_handle();
        handle.add_technical(
            "watcher ready",
            self.root.display().to_string(),
            serde_json::json!({ "duration_ms": started.elapsed().as_millis() }),
        );
        Ok(())
    }

    /// Публикация готового каталога внешнего источника после фоновой индексации.
    pub(crate) fn promote_external(
        &mut self,
        connection: Connection,
        index: LibraryIndex,
        source_name: String,
    ) -> Result<(), LibraryError> {
        let dirty = Arc::new(AtomicBool::new(false));
        let changed_paths = Arc::new(StdMutex::new(Vec::new()));
        self.runtime = Self::load_runtime(&self.root, &self.layout)?;
        self.mode = LibraryMode::External;
        self.source_name = Some(source_name);
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
        let _ = seed_bundled_plugins(&self.root, &self.layout);
        self.runtime =
            Self::load_runtime(&self.root, &self.layout).unwrap_or_else(|_| PluginRuntime::empty());
        self.mode = LibraryMode::Portable;
        self.source_name = None;
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
    /// выполняется опрос source-плагинов и сканирование источника. Пустая
    /// или неподдерживаемая директория открывается как портируемая библиотека.
    pub(crate) fn prepare_selected(
        root: &Path,
    ) -> Result<(bool, Connection, Option<LibraryIndex>, Option<String>), LibraryError> {
        let started = std::time::Instant::now();
        let index_file = index_path(root);
        let catalog_file = catalog_path(root);
        let mut runtime = Self::load_runtime(root, &Layout::default())?;
        let Some(source) = sources::coordinator::probe(&mut runtime, root)? else {
            return Ok((false, Self::prepare_portable(root)?, None, None));
        };
        if let Some(index) = LibraryIndex::load(&index_file, root)? {
            if let Some(connection) = open_cached_catalog(&catalog_file)? {
                // Библиотека не менялась: индекс переиспользуется без изменений.
                // Пользовательского уведомления не требуется — только техническая запись.
                let handle = get_journal_handle();
                handle.add_technical(
                    "cached catalog",
                    root.display().to_string(),
                    serde_json::json!({ "duration_ms": started.elapsed().as_millis() }),
                );
                return Ok((true, connection, Some(index), Some(source)));
            }
            // Файл каталога отсутствует, но индекс есть: каталог пересобирается
            // из индекса без повторного сканирования и без пользовательского
            // уведомления о создании индекса.
            let scanned = index.external_books();
            let book_count = scanned.len();
            let connection = build_catalog_at(&catalog_file, scanned)?;
            let handle = get_journal_handle();
            handle.add_technical(
                "catalog rebuilt from index",
                root.display().to_string(),
                serde_json::json!({ "duration_ms": started.elapsed().as_millis(), "books": book_count }),
            );
            return Ok((true, connection, Some(index), Some(source)));
        }

        let scanned = sources::coordinator::scan(&mut runtime, root, &source)?;
        let book_count = scanned.len();
        let handle = get_journal_handle();
        handle.add_technical(
            "scan",
            book_count.to_string(),
            serde_json::json!({ "duration_ms": started.elapsed().as_millis(), "books": book_count }),
        );
        if scanned.is_empty() {
            return Ok((false, Self::prepare_portable(root)?, None, None));
        }

        let index = LibraryIndex::from_external(root, source.clone(), scanned.clone());
        index.save_atomic(&index_file)?;
        let connection = build_catalog_at(&catalog_file, scanned)?;
        handle.add_technical(
            "index",
            root.display().to_string(),
            serde_json::json!({ "duration_ms": started.elapsed().as_millis() }),
        );
        // Создание индекса — ровно одно пользовательское событие.
        handle.add_user(
            "Индекс библиотеки создан",
            Severity::Info,
            root.display().to_string(),
            serde_json::json!({ "books": book_count }),
        );
        Ok((true, connection, Some(index), Some(source)))
    }

    /// Фоновая загрузка индекса внешнего источника и публикация его в каталоге.
    pub fn build_external_index(&mut self) -> Result<(), LibraryError> {
        let Some(source) = self.source_name.clone() else {
            return Ok(());
        };
        let path = index_path(&self.root);
        let (connection, index) = match LibraryIndex::load(&path, &self.root)? {
            Some(index) => (build_catalog_from_index(&index)?, index),
            None => {
                let scanned = sources::coordinator::scan(&mut self.runtime, &self.root, &source)?;
                let index = LibraryIndex::from_external(&self.root, source, scanned.clone());
                index.save_atomic(&path)?;
                (build_catalog_from_books(scanned)?, index)
            }
        };
        self.connection = connection;
        self.index = Some(index);
        Ok(())
    }

    /// Обновление каталога внешнего источника после событий файловой системы.
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
        // События вне папок книг (метаданные, служебные файлы) не требуют
        // переиндексации и не должны порождать уведомления.
        if affected.is_empty() {
            return Ok(());
        }
        let Some(index) = self.index.as_ref() else {
            return Ok(());
        };
        // Переиндексация выполняется только при реальных изменениях содержимого:
        // чтение файлов и события без изменения данных (например, atime при
        // старте) не должны приводить к пересборке индекса и к уведомлениям.
        let changed = index.filter_changed(&self.root, &affected);
        if changed.is_empty() {
            return Ok(());
        }
        let Some(source) = self.source_name.clone() else {
            return Ok(());
        };
        let mut books = index
            .books
            .iter()
            .filter(|book| !changed.contains(&self.root.join(&book.directory)))
            .map(|book| book.external())
            .collect::<Vec<_>>();
        for directory in &changed {
            if let Ok(relative) = directory.strip_prefix(&self.root) {
                let mut book = None;
                let relative_string = relative.to_string_lossy().into_owned();
                for attempt in 0..3 {
                    match sources::coordinator::scan_book(
                        &mut self.runtime,
                        &self.root,
                        &source,
                        &relative_string,
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

        let index = LibraryIndex::from_external(&self.root, source, books.clone());
        index.save_atomic(&index_path(&self.root))?;
        self.connection = build_catalog_from_books(books)?;
        self.index = Some(index);

        // Одно агрегированное уведомление на пакет изменений.
        let handle = get_journal_handle();
        handle.add_user(
            "Индекс библиотеки обновлён",
            Severity::Info,
            self.root.display().to_string(),
            serde_json::json!({ "changed_books": changed.len() }),
        );

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

    /// Имя плагина-источника, если библиотека внешняя.
    pub fn source_name(&self) -> Option<&str> {
        self.source_name.as_deref()
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

    /// Ссылка на плагинную подсистему библиотеки.
    pub(crate) fn runtime(&self) -> &PluginRuntime {
        &self.runtime
    }

    /// Многоразовая ссылка на плагинную подсистему библиотеки.
    pub(crate) fn runtime_mut(&mut self) -> &mut PluginRuntime {
        &mut self.runtime
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

/// Копирование поставляемых плагинов приложения в портируемую библиотеку.
///
/// Вызывается только для портируемых библиотек: внешняя библиотека доступна
/// только для чтения, и её плагины загружаются из ресурсов приложения.
/// Уже существующие папки плагинов не перезаписываются.
fn seed_bundled_plugins(root: &Path, layout: &Layout) -> Result<(), LibraryError> {
    let bundled = bundled_plugins_dir();
    if !bundled.is_dir() {
        return Ok(());
    }
    let destination = root.join(layout.plugins);
    for entry in fs::read_dir(&bundled)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let name = entry.file_name();
        let target = destination.join(&name);
        if target.exists() {
            continue;
        }
        fs::create_dir_all(&target)?;
        for file in fs::read_dir(entry.path())? {
            let file = file?;
            if file.file_type()?.is_file() {
                fs::copy(file.path(), target.join(file.file_name()))?;
            }
        }
    }
    Ok(())
}

/// Определение папок книг, затронутых изменениями файлов.
///
/// Служебные и скрытые каталоги (например, кэш `.booklib`) игнорируются,
/// чтобы их запись не вызывала переиндексацию.
fn affected_book_directories(root: &Path, paths: &[PathBuf]) -> std::collections::HashSet<PathBuf> {
    paths
        .iter()
        .filter_map(|path| path.strip_prefix(root).ok())
        .filter_map(|relative| {
            let components: Vec<_> = relative.components().collect();
            if components.len() < 2 {
                return None;
            }
            let hidden = components
                .iter()
                .any(|component| match component.as_os_str().to_str() {
                    Some(name) => name.starts_with('.'),
                    None => true,
                });
            if hidden {
                return None;
            }
            Some(
                root.join(components[0].as_os_str())
                    .join(components[1].as_os_str()),
            )
        })
        .collect()
}

#[cfg(test)]
#[path = "_tests.rs"]
mod tests;
