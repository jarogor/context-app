//! Портируемый слой библиотеки.
//!
//! Модуль отвечает за открытие и валидацию портируемой директории библиотеки,
//! создание служебных папок и файла SQLite-базы при первом открытии, а также
//! за выбор source-плагина для внешних read-only библиотек.

pub mod error;
mod layout;
mod mode;

pub use error::LibraryError;
pub use mode::LibraryMode;

use rusqlite::Connection;
use std::fs;
use std::path::{Path, PathBuf};

use crate::constants::DATABASE_FILE_NAME;
use crate::journal::{get_journal_handle, Severity};
use crate::plugin::PluginRuntime;

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
    /// Признак выполняющейся фоновой индексации.
    indexing: bool,
    /// Текущий этап загрузки библиотеки.
    stage: String,
    /// Плагинная подсистема библиотеки.
    runtime: PluginRuntime,
    /// Путь к bundled-плагинам приложения.
    bundled_plugins_dir: PathBuf,
}

impl Library {
    /// Быстрое создание состояния перед фоновой индексацией.
    /// Быстрое создание состояния с указанным путём к bundled-плагинам.
    pub fn open_for_selection(
        root: impl Into<PathBuf>,
        bundled_plugins_dir: PathBuf,
    ) -> Result<Self, LibraryError> {
        let root = root.into();
        if !root.exists() {
            return Err(LibraryError::NotADirectory(root));
        }
        if root.is_dir() {
            return Self::create_provisional_state(root, bundled_plugins_dir);
        }
        Self::open(root, bundled_plugins_dir)
    }

    /// Создание временного состояния до завершения фоновой индексации.
    fn create_provisional_state(
        root: PathBuf,
        bundled_plugins_dir: PathBuf,
    ) -> Result<Self, LibraryError> {
        let layout = Layout::default();
        Ok(Self {
            root,
            layout,
            connection: Connection::open_in_memory()?,
            mode: LibraryMode::Portable,
            source_name: None,
            indexing: true,
            stage: "opening".to_string(),
            runtime: PluginRuntime::empty(),
            bundled_plugins_dir,
        })
    }

    /// Открытие библиотеки по корневому пути.
    ///
    /// Внешняя библиотека распознаётся опросом source-плагинов: первый
    /// плагин, подтвердивший поддержку корня, становится источником книг,
    /// а каталог строится поверх индексного кэша. Портируемая библиотека
    /// создаёт структуру директории и базу данных при первом открытии.
    /// Открытие библиотеки с указанным путём к bundled-плагинам.
    pub fn open(
        root: impl Into<PathBuf>,
        bundled_plugins_dir: PathBuf,
    ) -> Result<Self, LibraryError> {
        let root = root.into();
        let layout = Layout::default();
        let mut runtime = Self::load_runtime(&root, &layout, bundled_plugins_dir.clone())?;
        if let Some(source) = Self::probe_source(&mut runtime, &root)? {
            runtime.set_sandbox_root(root.clone());
            let opened = runtime.source_open(&source)?;
            let connection = Connection::open_in_memory()?;
            let mut library = Self::create_external_state(
                root.clone(),
                connection,
                runtime,
                bundled_plugins_dir.clone(),
            )?;
            library.source_name = Some(source);
            if opened.catalog.books.is_empty() {
                return Self::open(root, bundled_plugins_dir);
            }
            return Ok(library);
        }

        Self::ensure_structure(&root, &layout)?;
        seed_bundled_plugins(&root, &layout, bundled_plugins_dir.clone())?;
        // Перезагрузка плагинов, чтобы поставляемые плагины стали
        // доступны и из собственной папки `plugins/` библиотеки.
        runtime = Self::load_runtime(&root, &layout, bundled_plugins_dir.clone())?;
        let database_path = root.join(DATABASE_FILE_NAME);
        let connection = Connection::open(&database_path)?;
        Ok(Self {
            root,
            layout,
            connection,
            mode: LibraryMode::Portable,
            source_name: None,
            indexing: false,
            stage: "ready".to_string(),
            runtime,
            bundled_plugins_dir,
        })
    }

    /// Создание состояния внешней библиотеки с виртуальным каталогом.
    fn create_external_state(
        root: PathBuf,
        connection: Connection,
        runtime: PluginRuntime,
        bundled_plugins_dir: PathBuf,
    ) -> Result<Self, LibraryError> {
        Ok(Self {
            root,
            layout: Layout::default(),
            connection,
            mode: LibraryMode::External,
            source_name: None,
            indexing: false,
            stage: "ready".to_string(),
            runtime,
            bundled_plugins_dir,
        })
    }

    /// Загрузка плагинов библиотеки из её `plugins/` и поставляемых ресурсов.
    ///
    /// Песочный корень плагинов устанавливается в корень библиотеки, чтобы
    /// source-плагины читали только её файлы.
    fn load_runtime(
        root: &Path,
        layout: &Layout,
        bundled_plugins_dir: PathBuf,
    ) -> Result<PluginRuntime, LibraryError> {
        let mut directories = vec![root.join(layout.plugins)];
        directories.push(bundled_plugins_dir);
        let mut runtime = PluginRuntime::load(&directories, root)?;
        let storage_root = root.with_extension("source-state");
        runtime.set_storage_root(storage_root);
        Ok(runtime)
    }

    /// Выбор source-плагина, подтвердившего корень библиотеки.
    fn probe_source(
        runtime: &mut PluginRuntime,
        root: &Path,
    ) -> Result<Option<String>, LibraryError> {
        if !root.exists() {
            return Ok(None);
        }
        runtime.set_sandbox_root(root.to_path_buf());
        for name in runtime.source_names() {
            runtime.source_capabilities(&name)?;
            if runtime.source_probe(&name)? {
                return Ok(Some(name));
            }
        }
        Ok(None)
    }

    /// Публикация готового каталога внешнего источника после фоновой индексации.
    pub(crate) fn promote_external(
        &mut self,
        connection: Connection,
        source_name: String,
    ) -> Result<(), LibraryError> {
        self.runtime =
            Self::load_runtime(&self.root, &self.layout, self.bundled_plugins_dir.clone())?;
        self.runtime.set_sandbox_root(self.root.clone());
        self.runtime.source_open(&source_name)?;
        self.mode = LibraryMode::External;
        self.source_name = Some(source_name);
        self.connection = connection;
        self.indexing = false;
        self.stage = "ready".to_string();
        // Внешний источник синхронизируется своим плагином. Ядро не следит
        // за его файлами и не поддерживает второй индекс состояния.
        Ok(())
    }

    /// Публикация готовой портируемой библиотеки.
    pub(crate) fn install_portable(&mut self, connection: Connection) {
        let _ = seed_bundled_plugins(&self.root, &self.layout, self.bundled_plugins_dir.clone());
        self.runtime =
            Self::load_runtime(&self.root, &self.layout, self.bundled_plugins_dir.clone())
                .unwrap_or_else(|_| PluginRuntime::empty());
        self.mode = LibraryMode::Portable;
        self.source_name = None;
        self.connection = connection;
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
        bundled_plugins_dir: PathBuf,
    ) -> Result<(bool, Connection, Option<String>), LibraryError> {
        let started = std::time::Instant::now();
        let mut runtime = Self::load_runtime(root, &Layout::default(), bundled_plugins_dir)?;
        let Some(source) = Self::probe_source(&mut runtime, root)? else {
            return Ok((false, Self::prepare_portable(root)?, None));
        };
        let opened = runtime.source_open(&source)?;
        let book_count = opened.catalog.books.len();
        let handle = get_journal_handle();
        handle.add_technical(
            "scan",
            book_count.to_string(),
            serde_json::json!({ "duration_ms": started.elapsed().as_millis(), "books": book_count }),
        );
        if book_count == 0 {
            return Ok((false, Self::prepare_portable(root)?, None));
        }

        handle.add_user(
            "Индекс библиотеки создан",
            Severity::Info,
            root.display().to_string(),
            serde_json::json!({ "books": book_count }),
        );
        Ok((true, Connection::open_in_memory()?, Some(source)))
    }

    /// Обновление каталога внешнего источника после событий файловой системы.
    pub fn sync_if_needed(&mut self) -> Result<(), LibraryError> {
        if self.mode == LibraryMode::External {
            self.invoke_source_operation("sync", serde_json::json!({}))?;
            return Ok(());
        }
        Ok(())
    }

    /// Признак наличия необработанных изменений файловой системы.
    pub fn is_dirty(&self) -> bool {
        false
    }

    /// Формат открытого источника книг.
    pub fn mode(&self) -> LibraryMode {
        self.mode
    }

    /// Имя плагина-источника, если библиотека внешняя.
    pub fn source_name(&self) -> Option<&str> {
        self.source_name.as_deref()
    }

    /// Выполнение opaque-операции активного source-плагина.
    pub(crate) fn invoke_source_operation(
        &mut self,
        operation: &str,
        payload: serde_json::Value,
    ) -> Result<String, LibraryError> {
        self.runtime
            .invoke_capability("library.catalog@1", operation, payload)
            .map_err(LibraryError::Plugin)
    }

    /// Корневой путь библиотеки.
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Разрешение относительного пути файла внутри активного корня библиотеки.
    pub fn resolve_file_path(&self, relative: &str) -> Result<PathBuf, LibraryError> {
        if relative.is_empty()
            || std::path::Path::new(relative).is_absolute()
            || relative.contains("..")
        {
            return Err(LibraryError::NotADirectory(PathBuf::from(relative)));
        }
        let root = self.root.canonicalize()?;
        let candidate = root.join(relative).canonicalize()?;
        if !candidate.starts_with(&root) || !candidate.is_file() {
            return Err(LibraryError::NotADirectory(PathBuf::from(relative)));
        }
        Ok(candidate)
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
fn seed_bundled_plugins(
    root: &Path,
    layout: &Layout,
    bundled_plugins_dir: PathBuf,
) -> Result<(), LibraryError> {
    if !bundled_plugins_dir.is_dir() {
        return Ok(());
    }
    let destination = root.join(layout.plugins);
    for entry in fs::read_dir(&bundled_plugins_dir)? {
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
